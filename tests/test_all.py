"""Tesztek a helyi környezethez. Előtte: bash tests/setup_local.sh

Három dolgot ellenőriznek:
  1. az árazás kézzel kiszámolt példákra a várt összeget adja,
  2. az ellenőrzés megfogja a hibás bemenetet,
  3. a teljes lánc működik: webhook -> (ál-)modell -> árazás -> PDF,
  4. a demóoldal négy végpontja (web/) ugyanezt a láncot végigviszi, és a hibás bemenetet elutasítja,
  5. az utánkövetés lezárja a beragadt kérést, egyszer emlékeztet, és a hibákról riasztást küld.
"""

import hashlib
import io
import json
import time
import uuid
from pathlib import Path

import boto3
import httpx
import psycopg
import pytest
from pypdf import PdfReader

DB = "postgresql://ajanlat:ajanlat-dev@127.0.0.1:5544/ajanlat"
WEBHOOK = "http://127.0.0.1:5679/webhook/ajanlatkeres"
APPROVE = "http://127.0.0.1:5679/webhook/ajanlat-jovahagyas"
FOLLOWUP = "http://127.0.0.1:5679/webhook/ajanlat-utankovetes"  # az Utánkövetés workflow kézi indítása
PDF = "http://127.0.0.1:8300/render"
WEB = "http://127.0.0.1:3000/api/requests"  # a demóoldal szerveroldala; a böngésző csak ezt látja
FAKE_MAIL = "http://127.0.0.1:8399/emails"  # az ál-levélküldő; megmondja, mit kapott csatolmányként
FAKE_SUBJECTS = "http://127.0.0.1:8399/subjects"  # címzettenként a kapott levelek tárgya
FAKE_ALERTS = "http://127.0.0.1:8399/discord"  # az ál-riasztócsatorna; megmondja, milyen riasztások jöttek
S3 = boto3.client(  # a helyi objektumtároló (RustFS), a docker-compose.yml-ben megadott helyi kulccsal
    "s3",
    endpoint_url="http://127.0.0.1:9100",
    aws_access_key_id="ajanlat-dev",
    aws_secret_access_key="ajanlat-dev-secret",
    region_name="us-east-1",
)

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


def test_event_log_follows_the_request(db):
    """A demóoldal a lépésnaplóból rajzol: a saját azonosítójával küldött kérés lépései sorban megvannak."""
    public_id = str(uuid.uuid4())
    result = httpx.post(
        WEBHOOK, json={"email": "vevo@example.com", "text": EXAMPLE_TEXT, "public_id": public_id}, timeout=30
    ).json()
    assert result["public_id"] == public_id
    steps = db.execute(
        "SELECT e.step FROM request_events e JOIN requests r ON r.id = e.request_id"
        " WHERE r.public_id = %s ORDER BY e.id",
        (public_id,),
    ).fetchall()
    assert [step for (step,) in steps] == ["received", "extracted", "checked", "priced"]


# --- 4. Jóváhagyás és küldés ---


def new_priced_request(email="vevo@example.com"):
    """Beküld egy árazható kérést, és visszaadja a nyilvános azonosítóját."""
    public_id = str(uuid.uuid4())
    result = httpx.post(WEBHOOK, json={"email": email, "text": EXAMPLE_TEXT, "public_id": public_id}, timeout=30).json()
    assert result["status"] == "priced"
    return public_id


def steps_of(db, public_id):
    rows = db.execute(
        "SELECT e.step FROM request_events e JOIN requests r ON r.id = e.request_id"
        " WHERE r.public_id = %s ORDER BY e.id",
        (public_id,),
    ).fetchall()
    return [step for (step,) in rows]


def test_approval_makes_pdf_and_sends_mail(db):
    """Az ál-levélküldő csak akkor fogadja el a kérést, ha a csatolmány valódi PDF."""
    public_id = new_priced_request()
    response = httpx.post(APPROVE, json={"public_id": public_id}, timeout=60)
    assert response.status_code == 200
    assert response.json()["status"] == "sent"
    assert steps_of(db, public_id)[-3:] == ["approved", "pdf_stored", "sent"]


def test_stored_pdf_is_the_mailed_pdf(db):
    """Az objektumtárolóban ugyanaz a fájl van, bájtra, mint ami levélben kiment."""
    public_id = new_priced_request()
    number = httpx.post(APPROVE, json={"public_id": public_id}, timeout=60).json()["number"]
    (key,) = db.execute("SELECT pdf_key FROM requests WHERE public_id = %s", (public_id,)).fetchone()
    assert key == f"{number}.pdf"

    stored = S3.get_object(Bucket="ajanlat-demo", Key=key)["Body"].read()
    assert stored.startswith(b"%PDF")
    mailed = httpx.get(f"{FAKE_MAIL}/{key}").json()["sha256"]
    assert hashlib.sha256(stored).hexdigest() == mailed


def test_second_approval_is_refused(db):
    """Dupla kattintásra nem megy két levél."""
    public_id = new_priced_request()
    assert httpx.post(APPROVE, json={"public_id": public_id}, timeout=60).status_code == 200
    second = httpx.post(APPROVE, json={"public_id": public_id}, timeout=60)
    assert second.status_code == 409
    assert second.json()["status"] == "not_approvable"
    assert steps_of(db, public_id).count("sent") == 1


def test_unknown_request_cannot_be_approved():
    response = httpx.post(APPROVE, json={"public_id": str(uuid.uuid4())}, timeout=60)
    assert response.status_code == 409
    assert response.json()["status"] == "not_found"


def test_daily_mail_limit_turns_off_sending(db):
    """Ha a napi keret elfogyott, a jóváhagyás megtörténik, de levél nem megy.

    A keretet a teszt maga adja meg a függvénynek, ezért az eredmény nem függ attól, hány levél ment el ma:
    a keret éppen a mai darabszám -> betelt; eggyel több -> még belefér.
    (A helyi workflow kerete 100000, lásd tests/setup_local.sh, így a többi teszt sosem éri el.)
    """
    public_id = new_priced_request()
    # az emlékeztető is levél, ugyanabból a keretből megy
    (sent_today,) = db.execute(
        "SELECT count(*) FROM request_events WHERE step IN ('sent', 'reminded') AND at >= date_trunc('day', now())"
    ).fetchone()

    for limit, expected in [(0, False), (sent_today, False), (sent_today + 1, True)]:
        result = db.execute("SELECT approve_request(%s::uuid, %s)", (public_id, limit)).fetchone()[0]
        db.rollback()  # csak a függvény válasza kell, a kérés maradjon jóváhagyatlan
        assert result["status"] == "approved"
        assert result["send_email"] is expected, f"keret: {limit}, ma elment: {sent_today}"


def test_default_daily_mail_limit_is_40(db):
    """A nyilvános demó kerete 40 (egy ajánlat két levél: az ajánlat és az emlékeztető): ez az adatbázis-függvény alapértéke és a repóban lévő workflow beállítása is."""
    (arguments,) = db.execute(
        "SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'approve_request'"
    ).fetchone()
    assert "p_daily_mail_limit integer DEFAULT 40" in arguments

    # a fájl helye ehhez a tesztfájlhoz képest, hogy ne számítson, melyik mappából indul a pytest
    workflow = json.loads((Path(__file__).parent.parent / "n8n/02-jovahagyas-kuldes.json").read_text(encoding="utf-8"))
    nodes = {node["name"]: node for node in workflow["nodes"]}
    settings = {a["name"]: a["value"] for a in nodes["Beállítások"]["parameters"]["assignments"]["assignments"]}
    assert settings["daily_mail_limit"] == 40
    # a beállítás tényleg eljut a függvényig, második paraméterként
    assert "$2::integer" in nodes["Jóváhagyás"]["parameters"]["query"]
    assert "daily_mail_limit" in nodes["Jóváhagyás"]["parameters"]["options"]["queryReplacement"]


# --- 5. Utánkövetés és hibakezelés ---


def wait_for(question, timeout=30):
    """Fél másodpercenként újra megkérdezi, amíg a `question()` igazat nem ad. A workflow a háttérben fut, ezért kell várni."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        answer = question()
        if answer:
            return answer
        time.sleep(0.5)
    raise AssertionError(f"{timeout} mp alatt nem történt meg, amire a teszt várt")


def alerts():
    return httpx.get(FAKE_ALERTS).json()["alerts"]


def subjects_for(email):
    return httpx.get(f"{FAKE_SUBJECTS}/{email}").json()["subjects"]


def request_row(db, public_id):
    """A kérés belső sorszáma és állapota. A commit azért kell, hogy a kapcsolat a workflow friss írásait is lássa."""
    db.commit()
    return db.execute("SELECT id, status FROM requests WHERE public_id = %s", (public_id,)).fetchone()


def make_older(db, public_id, interval, step=None):
    """Visszadátumozza a kérés naplóját, mintha régebben történt volna (egy lépést, vagy ha nincs megadva, mindet)."""
    db.execute(
        "UPDATE request_events e SET at = e.at - %s::interval FROM requests r"
        " WHERE r.id = e.request_id AND r.public_id = %s AND (%s::text IS NULL OR e.step = %s)",
        (interval, public_id, step, step),
    )
    db.commit()


def new_sent_request(db, email, sent_ago):
    """Végigvisz egy kérést a kiküldésig, majd visszadátumozza a kiküldést."""
    public_id = new_priced_request(email)
    assert httpx.post(APPROVE, json={"public_id": public_id}, timeout=30).json()["status"] == "sent"
    make_older(db, public_id, sent_ago, step="sent")
    return public_id


def test_failed_workflow_sends_alert_and_request_gets_closed(db):
    """Ha a modell nem válaszol, a workflow hibával áll le: erről riasztás megy, a beragadt kérést pedig az utánkövetés lezárja."""
    public_id = str(uuid.uuid4())
    alerts_before = len(alerts())
    response = httpx.post(
        WEBHOOK, json={"email": "vevo@example.com", "text": "hibateszt: 5 mobil", "public_id": public_id}, timeout=60
    )
    assert response.status_code == 500
    wait_for(lambda: any("Ajánlat 1" in alert and "Modell" in alert for alert in alerts()[alerts_before:]))

    request_id, status = request_row(db, public_id)
    assert status == "received"  # a kérés félúton maradt, magától senki nem jelöli hibásnak

    # friss kérést az utánkövetés még nem zár le (lehet, hogy éppen fut)
    db.execute("SELECT fail_stuck_requests(10)")
    assert request_row(db, public_id)[1] == "received"

    make_older(db, public_id, "1 hour")
    assert httpx.post(FOLLOWUP, json={}).status_code == 200
    wait_for(lambda: request_row(db, public_id)[1] == "failed")
    assert steps_of(db, public_id) == ["received", "failed"]
    wait_for(lambda: any(f"kérés #{request_id}," in alert for alert in alerts()[alerts_before:]))


def test_stuck_check_leaves_waiting_and_finished_requests_alone(db):
    """Csak a félúton maradt kérés beragadt. Aki a nézőre vár (priced), vagy végzett (sent), ahhoz nem nyúl, akármilyen régi."""
    waiting = new_priced_request()
    finished = new_sent_request(db, "vevo@example.com", "0 hours")
    make_older(db, waiting, "2 days")
    make_older(db, finished, "2 days")

    db.execute("SELECT fail_stuck_requests(10)")
    db.commit()
    assert request_row(db, waiting)[1] == "priced"
    assert request_row(db, finished)[1] == "sent"


def test_reminder_goes_out_once(db):
    """A két percnél régebben kiküldött ajánlat egy emlékeztetőt kap; a következő futás már nem küld újat."""
    email = f"emlekezteto-{uuid.uuid4().hex[:8]}@example.com"
    public_id = new_sent_request(db, email, "5 minutes")
    assert len(subjects_for(email)) == 1  # eddig csak az ajánlat levele ment el

    assert httpx.post(FOLLOWUP, json={}).status_code == 200
    wait_for(lambda: len(subjects_for(email)) == 2)
    assert subjects_for(email)[1].startswith("Emlékeztető: ")
    assert steps_of(db, public_id)[-1] == "reminded"
    assert request_row(db, public_id)[1] == "sent"  # az emlékeztető nem állapot, csak egy lépés a naplóban

    assert httpx.post(FOLLOWUP, json={}).status_code == 200
    time.sleep(3)
    assert len(subjects_for(email)) == 2


def test_fresh_quote_gets_no_reminder(db):
    """A két percnél frissebb ajánlat még nem esedékes."""
    email = f"friss-{uuid.uuid4().hex[:8]}@example.com"
    public_id = new_sent_request(db, email, "1 minute")
    assert httpx.post(FOLLOWUP, json={}).status_code == 200
    time.sleep(3)
    assert len(subjects_for(email)) == 1
    assert "reminded" not in steps_of(db, public_id)


def test_expired_quote_and_full_mail_limit_get_no_reminder(db):
    """Lejárt ajánlatra nem megy emlékeztető, és akkor sem, ha a napi levélkeret betelt."""
    email = f"lejart-{uuid.uuid4().hex[:8]}@example.com"
    expired = new_sent_request(db, email, "20 days")
    db.execute(
        "UPDATE quotes SET valid_until = current_date - 1 WHERE request_id = (SELECT id FROM requests WHERE public_id = %s)",
        (expired,),
    )
    db.commit()
    due = new_sent_request(db, email, "5 minutes")

    assert db.execute("SELECT claim_due_reminders(2, 0)").fetchone()[0]["count"] == 0  # a keret betelt
    db.rollback()

    reminders = db.execute("SELECT claim_due_reminders(2, 100000)").fetchone()[0]["reminders"]
    db.rollback()  # csak a függvény válasza kell, levél ne menjen
    request_ids = [reminder["request_id"] for reminder in reminders]
    assert request_row(db, due)[0] in request_ids
    assert request_row(db, expired)[0] not in request_ids


def test_failed_reminder_is_logged_and_alerted_not_retried(db):
    """Ha az emlékeztetőt a levélküldő háromszor sem fogadja el: a naplóba hiba kerül, riasztás megy, és nem próbálja újra."""
    email = f"vevo-{uuid.uuid4().hex[:8]}@example.com"
    public_id = new_sent_request(db, email, "4 days")
    # a címet csak most írjuk át olyanra, amit az ál-levélküldő visszadob: az ajánlat levele még rendben elment
    bouncing = email.replace("vevo-", "visszapattan-")
    db.execute("UPDATE requests SET email = %s WHERE public_id = %s", (bouncing, public_id))
    db.commit()
    alerts_before = len(alerts())

    assert httpx.post(FOLLOWUP, json={}).status_code == 200
    wait_for(lambda: steps_of(db, public_id)[-1] == "reminder_failed")
    assert steps_of(db, public_id)[-2:] == ["reminded", "reminder_failed"]
    wait_for(lambda: any("nem ment el az emlékeztető" in alert for alert in alerts()[alerts_before:]))

    assert httpx.post(FOLLOWUP, json={}).status_code == 200
    time.sleep(3)
    assert steps_of(db, public_id).count("reminded") == 1
    assert subjects_for(bouncing) == []


def test_all_workflows_report_errors_to_the_followup_workflow():
    """A repóban lévő mindhárom workflow hibakezelője az Utánkövetés workflow."""
    for path in sorted((Path(__file__).parent.parent / "n8n").glob("*.json")):
        workflow = json.loads(path.read_text(encoding="utf-8"))
        assert workflow["settings"]["errorWorkflow"] == "ajanlatUtankovetes", path.name


# --- 6. A demóoldal végpontjai (web/) ---


def web_create(text, public_id=None, email="vevo@example.com"):
    """Beküld egy kérést a demóoldalon át, ugyanúgy, ahogy a böngésző teszi."""
    public_id = public_id or str(uuid.uuid4())
    response = httpx.post(WEB, json={"public_id": public_id, "email": email, "text": text}, timeout=60)
    return public_id, response


def web_poll(public_id, until, timeout=30):
    """Fél másodpercenként lekérdezi az állapotot, mint az oldal, amíg az `until` lépések egyike meg nem jelenik a naplóban."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = httpx.get(f"{WEB}/{public_id}")
        if response.status_code == 200 and set(until) & {event["step"] for event in response.json()["events"]}:
            return response.json()
        time.sleep(0.5)
    raise AssertionError(f"{timeout} mp alatt nem jött meg a(z) {until} lépés")


def test_web_full_flow_from_request_to_pdf(db):
    """Beküldés -> figyelés az árazásig -> jóváhagyás -> a letöltött PDF bájtra az, ami a tárolóban van.

    A helyi workflow napi levélkerete 100000 (tests/setup_local.sh), ezért a levélnek el kell mennie.
    """
    public_id, response = web_create(EXAMPLE_TEXT)
    assert response.status_code == 201
    assert response.json() == {"public_id": public_id, "status": "priced"}

    status = web_poll(public_id, until=["priced"])
    assert status["status"] == "priced"
    assert [event["step"] for event in status["events"]] == ["received", "extracted", "checked", "priced"]
    assert [quote["term_months"] for quote in status["quotes"]] == [12, 24]
    assert status["quotes"][1]["totals"]["contract_net"] == 11_748_670
    assert len(status["quotes"][1]["lines"]) == 5
    assert status["pdf_available"] is False
    # a belső sorszám nem szivároghat ki, kifelé csak a public_id azonosít
    assert "id" not in status and "request_id" not in status

    # jóváhagyás előtt még nincs mit letölteni
    assert httpx.get(f"{WEB}/{public_id}/pdf").status_code == 404

    approval = httpx.post(f"{WEB}/{public_id}/approve", timeout=60)
    assert approval.status_code == 200
    mail = approval.json()["status"]
    assert mail == "sent"
    assert approval.json()["number"] == status["quotes"][0]["number"]

    status = web_poll(public_id, until=["sent", "email_skipped"])
    assert [event["step"] for event in status["events"]][-3:] == ["approved", "pdf_stored", mail]
    assert status["pdf_available"] is True

    # dupla kattintás: a második jóváhagyás 409-et kap, ahogy az n8n-től jön
    second = httpx.post(f"{WEB}/{public_id}/approve", timeout=60)
    assert second.status_code == 409
    assert second.json()["error"] == "not_approvable"

    downloaded = httpx.get(f"{WEB}/{public_id}/pdf")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    (key,) = db.execute("SELECT pdf_key FROM requests WHERE public_id = %s", (public_id,)).fetchone()
    assert key in downloaded.headers["content-disposition"]
    stored = S3.get_object(Bucket="ajanlat-demo", Key=key)["Body"].read()
    assert downloaded.content == stored
    assert downloaded.content.startswith(b"%PDF")


def test_web_clarification_branch():
    """Ha a kérésben olyan van, ami nincs az árlistán, ajánlat helyett a hibalista jön."""
    public_id, response = web_create("Kell 5 mobil és 2 drón.")
    assert response.status_code == 201
    status = web_poll(public_id, until=["needs_clarification"])
    assert status["status"] == "needs_clarification"
    assert status["quotes"] == []
    assert "Nincs az árlistán: 2 drón" in status["problems"]
    assert [event["step"] for event in status["events"]] == ["received", "extracted", "checked", "needs_clarification"]
    # ami nincs beárazva, azt jóváhagyni sem lehet
    assert httpx.post(f"{WEB}/{public_id}/approve", timeout=60).status_code == 409


@pytest.mark.parametrize(
    "body",
    [
        {"public_id": "nem-uuid", "email": "vevo@example.com", "text": EXAMPLE_TEXT},
        {"email": "vevo@example.com", "text": EXAMPLE_TEXT},  # hiányzó azonosító
        {"public_id": str(uuid.uuid4()), "email": "nem e-mail", "text": EXAMPLE_TEXT},
        {"public_id": str(uuid.uuid4()), "email": "vevo@example.com", "text": "   "},
        {"public_id": str(uuid.uuid4()), "email": "vevo@example.com", "text": "a" * 2001},
    ],
)
def test_web_rejects_invalid_input(db, body):
    """A hibás bemenet 400-at kap, és el sem jut az n8n-ig: nem lesz belőle sor az adatbázisban."""
    response = httpx.post(WEB, json=body, timeout=60)
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_input"
    if "public_id" in body and body["public_id"] != "nem-uuid":
        assert db.execute("SELECT count(*) FROM requests WHERE public_id = %s", (body["public_id"],)).fetchone()[0] == 0


def test_web_same_public_id_twice_is_refused():
    public_id, first = web_create(EXAMPLE_TEXT)
    assert first.status_code == 201
    _, second = web_create(EXAMPLE_TEXT, public_id=public_id)
    assert second.status_code == 409
    assert second.json()["error"] == "duplicate"


def test_web_unknown_public_id():
    unknown = str(uuid.uuid4())
    assert httpx.get(f"{WEB}/{unknown}").status_code == 404
    assert httpx.get(f"{WEB}/{unknown}/pdf").status_code == 404
    assert httpx.post(f"{WEB}/{unknown}/approve", timeout=60).status_code == 409  # az n8n válasza megy tovább
    assert httpx.get(f"{WEB}/nem-uuid").status_code == 400
