"""PDF-készítő: az árazott ajánlatból (JSON) márkázott PDF-et csinál.

Két lépés:
  1. a Jinja2 sablon (templates/quote.html) és az adatok -> kész HTML
  2. a Playwright megnyitja a HTML-t egy fej nélküli Chromiumban, és PDF-be "nyomtatja"

Ez a szolgáltatás nem számol árat. Minden összeg úgy kerül a PDF-be,
ahogy az adatbázis price_quote() függvénye visszaadta.
"""

from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import FastAPI, Response
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.async_api import async_playwright
from pydantic import BaseModel

# A kitalált cég adatai egy helyen. Ha változik a név, csak itt kell átírni.
COMPANY = {
    "name": "Kéktorony Telekom Zrt.",
    "tagline": "Üzleti telekom- és IT-szolgáltatás",
    "address": "1117 Budapest, Minta utca 12.",
    "email": "ajanlat@kektorony.example",
    "note": "Kitalált cég, kitalált árakkal. Ez az ajánlat egy demó kimenete, nem valós ajánlat.",
}

CATEGORY_NAMES = {
    "mobil": "Mobil",
    "internet": "Internet",
    "eszkoz": "Eszközök",
    "felho": "Felhő",
    "uzemeltetes": "Üzemeltetés",
}


# --- A bemenet alakja. A FastAPI ez alapján ellenőrzi a beérkező JSON-t. ---


class Quote(BaseModel):
    number: str  # pl. AJ-2026-0001
    term_months: int  # 12 vagy 24
    valid_until: date
    priced: dict  # a price_quote() kimenete: {"lines": [...], "totals": {...}}


class RenderRequest(BaseModel):
    customer_email: str
    request_text: str  # az eredeti, szabad szöveges kérés
    quotes: list[Quote]  # 1 elem, vagy 2, ha a kérésben nem volt hűségidő


# --- Sablon ---


def huf(value) -> str:
    """4229950 -> '4 229 950 Ft' (nem törhető szóközzel, hogy ne essen szét sor végén)."""
    return f"{int(value):,}".replace(",", " ") + " Ft"


def pct(value) -> str:
    """10.0 -> '10%', 2.5 -> '2,5%'."""
    return f"{float(value):g}".replace(".", ",") + "%"


templates = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),  # a néző szövege nem tud HTML-t becsempészni
)
templates.filters["huf"] = huf
templates.filters["pct"] = pct


def render_html(data: RenderRequest) -> str:
    return templates.get_template("quote.html").render(
        company=COMPANY,
        category_names=CATEGORY_NAMES,
        today=date.today(),
        customer_email=data.customer_email,
        request_text=data.request_text,
        quotes=[q.model_dump() for q in data.quotes],
    )


# --- Böngésző: egyszer indul el a szolgáltatással, nem kérésenként (az lassú lenne). ---

state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    playwright = await async_playwright().start()
    state["browser"] = await playwright.chromium.launch()
    yield  # itt fut a szolgáltatás
    await state["browser"].close()
    await playwright.stop()


app = FastAPI(title="Ajánlat PDF-készítő", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/render")
async def render(data: RenderRequest):
    html = render_html(data)
    page = await state["browser"].new_page()
    try:
        await page.set_content(html, wait_until="load")
        pdf = await page.pdf(format="A4", print_background=True)
    finally:
        await page.close()
    filename = f"{data.quotes[0].number}.pdf" if data.quotes else "ajanlat.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
