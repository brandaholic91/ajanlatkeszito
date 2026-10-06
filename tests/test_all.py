"""Tesztek a helyi környezethez. Előtte: bash tests/setup_local.sh

Három dolgot ellenőriznek:
  1. az árazás kézzel kiszámolt példákra a várt összeget adja,
  2. az ellenőrzés megfogja a hibás bemenetet,
  3. a teljes lánc működik: webhook -> (ál-)modell -> árazás -> PDF.
"""

import io
import json

import httpx
import psycopg
import pytest
from pypdf import PdfReader

DB = "postgresql://ajanlat:ajanlat-dev@127.0.0.1:5544/ajanlat"
WEBHOOK = "http://127.0.0.1:5679/webhook/ajanlatkeres"
PDF = "http://127.0.0.1:8300/render"

EXAMPLE_TEXT = (
    "Új irodát nyitunk 40 fővel. Kell 40 mobil-előfizetés, ebből 10 korlátlan adattal, "
    "gigabites internet, 15 laptop és céges levelezés."
)
EXAMPLE_ITEMS = [
    {"sku": "MOB-PLUS", "qty": 30},
    {"sku": "MOB-MAX", "qty": 10},
    {"sku": "NET-1000", "qty": 1},
    {"sku": "DEV-LAPTOP-STD", "qty": 15},
    {"sku": "CLD-MAIL", "qty": 40},
]


@pytest.fixture(scope="module")
def db():
    with psycopg.connect(DB) as connection:
        yield connection


def price(db, items, term):
    return db.execute("SELECT price_quote(%s::jsonb, %s)", (json.dumps(items), term)).fetchone()[0]


def check(db, extracted):
    return db.execute("SELECT check_request(%s::jsonb)", (json.dumps(extracted),)).fetchone()[0]


# --- 1. Árazás ---


def test_example_24_months(db):
    """A terv példakérése, kézzel kiszámolva.

    Havi:    30 × 4 941 (5 490 −10%) + 10 × 8 091 (8 990 −10%) + 19 900 + 40 × 1 606 (1 690 −5%) = 313 280
    Egyszeri: 25 000 (internet telepítés) + 15 × 280 330 (289 000 −3%)                          = 4 229 950
    Szerződés: 4 229 950 + 24 × 313 280                                                          = 11 748 670
    """
    totals = price(db, EXAMPLE_ITEMS, 24)["totals"]
    assert totals["monthly_net"] == 313_280
    assert totals["one_time_net"] == 4_229_950
    assert totals["contract_net"] == 11_748_670
    assert totals["contract_gross"] == 14_920_811  # + 27% áfa


def test_12_months_is_more_expensive_per_month(db):
    assert price(db, EXAMPLE_ITEMS, 12)["totals"]["monthly_net"] == 354_480


def test_discount_tier_boundary(db):
    """9 mobilnál nincs kedvezmény, 10-nél 5%."""
    nine = price(db, [{"sku": "MOB-PLUS", "qty": 9}], 24)["lines"][0]
    ten = price(db, [{"sku": "MOB-PLUS", "qty": 10}], 24)["lines"][0]
    assert (nine["discount_pct"], nine["monthly_unit"]) == (0, 5490)
    assert (ten["discount_pct"], ten["monthly_unit"]) == (5, 5216)  # 5 490 × 0,95 = 5 215,5 -> 5 216


def test_discount_counts_whole_category(db):
    """6 Plusz + 4 Korlátlan = 10 mobil, tehát mindkettő 5%-ot kap."""
    lines = price(db, [{"sku": "MOB-PLUS", "qty": 6}, {"sku": "MOB-MAX", "qty": 4}], 24)["lines"]
    assert [line["discount_pct"] for line in lines] == [5, 5]


def test_non_discountable_item_never_gets_discount(db):
    lines = price(db, [{"sku": "OPS-NETWORK", "qty": 1}, {"sku": "OPS-HELPDESK", "qty": 60}], 24)["lines"]
    by_sku = {line["sku"]: line["discount_pct"] for line in lines}
    assert by_sku == {"OPS-HELPDESK": 10, "OPS-NETWORK": 0}


# --- 2. Ellenőrzés ---


def test_check_accepts_good_request(db):
    assert check(db, {"items": EXAMPLE_ITEMS, "unknown": [], "term_months": None}) == []


@pytest.mark.parametrize(
    "extracted, expected",
    [
        ({"items": []}, "Nem találtam árazható tételt"),
        ({"items": [{"sku": "MOB-PLUS", "qty": 1}], "unknown": [{"text": "2 drón"}]}, "Nincs az árlistán: 2 drón"),
        ({"items": [{"sku": "MOB-GIGA", "qty": 1}]}, "Ismeretlen tételazonosító: MOB-GIGA"),
        ({"items": [{"sku": "CLD-MAIL", "qty": None}]}, "Hiányzik a mennyiség: CLD-MAIL"),
        ({"items": [{"sku": "CLD-MAIL", "qty": 0}]}, "Hiányzik a mennyiség: CLD-MAIL"),
        ({"items": [{"sku": "MOB-PLUS", "qty": 1}], "term_months": 36}, "A hűségidő csak 12 vagy 24"),
    ],
)
def test_check_catches_problems(db, extracted, expected):
    problems = check(db, extracted)
    assert any(expected in problem for problem in problems), problems


# --- 3. A teljes lánc ---


def test_end_to_end_quote_and_pdf():
    result = httpx.post(WEBHOOK, json={"email": "vevo@example.com", "text": EXAMPLE_TEXT}, timeout=30).json()
    assert result["status"] == "priced"
    # a kérésben nincs hűségidő -> két változat
    assert [quote["term_months"] for quote in result["quotes"]] == [12, 24]
    assert result["quotes"][1]["priced"]["totals"]["contract_net"] == 11_748_670

    response = httpx.post(
        PDF,
        json={"customer_email": "vevo@example.com", "request_text": EXAMPLE_TEXT, "quotes": result["quotes"]},
        timeout=30,
    )
    assert response.status_code == 200
    pages = PdfReader(io.BytesIO(response.content)).pages
    assert len(pages) == 2  # változatonként egy oldal
    text = pages[1].extract_text().replace("\u00a0", " ")
    assert result["quotes"][1]["number"] in text
    assert "11 748 670 Ft" in text


def test_end_to_end_unknown_item_asks_back():
    result = httpx.post(WEBHOOK, json={"email": "vevo@example.com", "text": "Kell 5 mobil és 2 drón."}, timeout=30).json()
    assert result["status"] == "needs_clarification"
    assert result["quotes"] == []
    assert "Nincs az árlistán: 2 drón" in result["problems"]


def test_end_to_end_unparseable_answer_asks_back():
    """Ha a modell nem JSON-t ad vissza, nem készül ajánlat."""
    result = httpx.post(WEBHOOK, json={"email": "vevo@example.com", "text": "asdf qwer"}, timeout=30).json()
    assert result["status"] == "needs_clarification"
