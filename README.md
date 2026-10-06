# Ajánlatkészítő

Szabad szöveges ajánlatkérésből márkázott PDF-ajánlat. A terv: `~/Obsidian/second-brain/2026-10-06 Ajánlatkészítő terv.md`.

**Állapot (2026-10-06):** az 1. nap kész és helyben tesztelve: árlista, árazás, ellenőrzés, a Feldolgozás workflow, a PDF-készítő. Valódi modellel (opencode Go, `deepseek-v4.1-flash`) a terv példakérése egyszer futott le, helyesen; a többi teszt ál-modellel megy.

## Mi hol van

| Fájl | Mit csinál |
|---|---|
| `db/01_schema.sql` | A táblák: `products` (árlista), `volume_discounts` (kedvezménysávok), `requests` (kérések), `quotes` (ajánlatok) |
| `db/02_pricing.sql` | Három függvény: `check_request` (ellenőrzés), `price_quote` (árazás), `process_request` (a kettő együtt, mentéssel) |
| `db/03_seed.sql` | A kitalált árlista: 22 tétel, 12 kedvezménysáv |
| `n8n/01-feldolgozas.json` | Az első workflow (1–4. lépés), importálható az n8n-be |
| `pdf-service/main.py` | A PDF-készítő: FastAPI-végpont, amely a sablonból Playwrighttal PDF-et készít |
| `pdf-service/templates/quote.html` | Az ajánlat kinézete (HTML és CSS, Jinja2 sablon) |
| `tests/` | Ál-modell, a helyi környezet beállítása, 15 teszt |
| `samples/minta-ajanlat.pdf` | Egy kész mintaajánlat a terv példakéréséből |
| `docker-compose.yml` | A helyi környezet: Postgres, PDF-készítő, n8n, és teszthez az ál-modell |

## Hogyan megy végig egy kérés

1. **Webhook** (`POST /webhook/ajanlatkeres`, `{"email": ..., "text": ...}`): ide küld majd a demóoldal.
2. **Beállítások:** a modell címe, neve és a prompt. Ha modellt cserélsz, csak ezt a csomópontot kell átírni.
3. **Kérés mentése:** egy sor a `requests` táblába, `received` állapottal.
4. **Árlista lekérése:** az árlista szövegként (azonosító, név, egység, mikor válassza), árak nélkül. A modell árat nem lát, így kitalálni sem tud.
5. **Modell: tételek kiolvasása:** a prompt és a kérés megy a modellnek, vissza egy JSON jön: `items` (azonosító és mennyiség), `unknown` (amit nem talált az árlistán), `term_months`.
6. **Válasz értelmezése:** a modell szövegéből JSON-objektum lesz. Ha a válasz nem értelmezhető, üres tétellistát ad tovább, és a következő lépés visszakérdezésre viszi.
7. **Ellenőrzés és árazás:** `SELECT process_request(...)`. Ha az ellenőrzés hibát talál, `needs_clarification` az állapot, és nincs ajánlat. Különben elkészül az ajánlat; ha a kérésben nincs hűségidő, kettő (12 és 24 hónap).
8. **Árazható?** és a két válasz: a hívó megkapja az ajánlato(ka)t vagy a hibalistát.

## Az árazás szabályai (`price_quote`)

- Minden ár nettó forint, az áfa 27%, az összesítőre számolva.
- A havidíj a hűségidőtől függ: a `monthly_net_24` olcsóbb, mint a `monthly_net_12`.
- **A kedvezménysáv a kategória összes darabszámán múlik**, nem az egyes sorokén: 30 Plusz és 10 Korlátlan mobil együtt 40 db, ezért mindkettő a 25 db-os sáv 10%-át kapja.
- A `discountable = false` tétel (internet, hálózatépítés) nem kap kedvezményt, és nem számít bele a darabszámba.
- A kedvezményes egységár egész forintra kerekítve; a sor összege egységár × mennyiség.
- Teljes szerződéses érték = egyszeri költség + havi költség × hűségidő.

## Helyi futtatás

```bash
bash tests/setup_local.sh      # elindít mindent, betölti a workflow-t az ál-modellel
uv run --with pytest --with httpx --with 'psycopg[binary]' --with pypdf pytest tests/ -v
docker compose --profile test down     # leállítás (az adat megmarad; -v kapcsolóval törlődik is)
```

| Mi | Cím |
|---|---|
| n8n | http://localhost:5679 (első megnyitáskor tulajdonosi fiókot kér) |
| PDF-készítő | http://localhost:8300/docs |
| Postgres | `psql postgresql://ajanlat:ajanlat-dev@127.0.0.1:5544/ajanlat` |

Ha az `db/*.sql` változik, az adatbázist újra kell építeni, mert a Postgres csak üres adatmappánál futtatja le őket: `docker compose --profile test down -v`, majd újra a `setup_local.sh`.

## Amit tudni kell

- **Az opencode Go két dolgot kér:** `Authorization: Bearer <kulcs>` fejlécet és `x-opencode-session` fejlécet (enélkül 400-at ad). Az utóbbit a modellhívás csomópontja küldi, kérésenként `ajanlat-<kérésazonosító>` értékkel.
- **Parancssoros importálás után az első kérés még a régi workflow-változattal futhat.** Kétszer fordult elő; az okát nem derítettem ki. Importálás és újraindítás után az első hibás futást ismételd meg, mielőtt hibát keresel.

- **Mérés (2026-10-06, `deepseek-v4.1-flash`, thinking nélkül): 19 / 20.** A kérések: `tests/eval_requests.json`, a futtató: `tests/run_eval.py`, a részletes eredmény: `tests/eval_results.json`. Egy futás, a promptot nem hangoltam a tesztkérésekre. Az egyetlen hiba a 16-os (ékezet nélküli, szleng: „10 telo kene elofizetessel egyutt”): a modell a telefonokat kihagyta, és hiányos ajánlat készült.
- A `pytest` tesztek ál-modellel (`tests/fake_llm.py`) futnak: a bekötést és az árazást igazolják, a promptot nem.
- **A cégnév munkanév** („Kéktorony Telekom Zrt."), nincs ellenőrizve, hogy létezik-e ilyen cég. Egy helyen cserélhető: `pdf-service/main.py`, `COMPANY`.
- **A `tests/dev-credentials.json` jelszava csak a helyi adatbázisé**, valódi kulcs nincs a repóban.
- A workflow hitelesítő adatai név szerint: `Ajánlat DB` (Postgres) és `LLM kulcs` (Header Auth: `Authorization` = `Bearer <kulcs>`).
