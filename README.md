# Ajánlatkészítő

Szabad szöveges ajánlatkérésből márkázott PDF-ajánlat. A terv: `~/Obsidian/second-brain/2026-10-06 Ajánlatkészítő terv.md`.

**Állapot (2026-10-06):** az 1. nap kész és helyben tesztelve: árlista, árazás, ellenőrzés, a Feldolgozás workflow, a PDF-készítő. Valódi modellel (opencode Go, `deepseek-v4.1-flash`) a terv példakérése egyszer futott le, helyesen; a többi teszt ál-modellel megy.

## Mi hol van

| Fájl | Mit csinál |
|---|---|
| `db/01_schema.sql` | A táblák: `products` (árlista), `volume_discounts` (kedvezménysávok), `requests` (kérések), `request_events` (lépésnapló), `quotes` (ajánlatok) |
| `db/02_pricing.sql` | Négy függvény: `check_request` (ellenőrzés), `price_quote` (árazás), `log_event` (egy sor a lépésnaplóba), `process_request` (ellenőrzés és árazás együtt, mentéssel és naplózással) |
| `db/03_seed.sql` | A kitalált árlista: 22 tétel, 12 kedvezménysáv |
| `db/04_approval.sql` | A jóváhagyás adatbázis-oldala: `approve_request` (jóváhagyás, napi levélkerettel), `set_status` (állapotváltás naplózással), `store_pdf_key` (a tárolt PDF helye) |
| `n8n/01-feldolgozas.json` | Az első workflow (1–4. lépés), importálható az n8n-be |
| `n8n/02-jovahagyas-kuldes.json` | A második workflow (5–7. lépés): jóváhagyás, PDF, levél |
| `pdf-service/main.py` | A PDF-készítő: FastAPI-végpont, amely a sablonból Playwrighttal PDF-et készít |
| `pdf-service/templates/quote.html` | Az ajánlat kinézete (HTML és CSS, Jinja2 sablon) |
| `tests/` | Ál-modell és ál-levélküldő, a helyi környezet beállítása, 21 teszt |
| `samples/minta-ajanlat.pdf` | Egy kész mintaajánlat a terv példakéréséből |
| `docker-compose.yml` | A helyi környezet: Postgres, PDF-készítő, n8n, objektumtároló (RustFS), és teszthez az ál-modell |

## Hogyan megy végig egy kérés

1. **Webhook** (`POST /webhook/ajanlatkeres`, `{"email": ..., "text": ..., "public_id": ...}`): ide küld majd a demóoldal. A `public_id` nem kötelező: ez egy UUID, amit a demóoldal maga generál, hogy a választ meg sem várva tudja figyelni a kérést.
2. **Beállítások:** a modell címe, neve és a prompt. Ha modellt cserélsz, csak ezt a csomópontot kell átírni.
3. **Kérés mentése:** egy sor a `requests` táblába, `received` állapottal, és az első sor a lépésnaplóba.
4. **Árlista lekérése:** az árlista szövegként (azonosító, név, egység, mikor válassza), árak nélkül. A modell árat nem lát, így kitalálni sem tud.
5. **Modell: tételek kiolvasása:** a prompt és a kérés megy a modellnek, vissza egy JSON jön: `items` (azonosító és mennyiség), `unknown` (amit nem talált az árlistán), `term_months`.
6. **Válasz értelmezése:** a modell szövegéből JSON-objektum lesz. Ha a válasz nem értelmezhető, üres tétellistát ad tovább, és a következő lépés visszakérdezésre viszi.
7. **Ellenőrzés és árazás:** `SELECT process_request(...)`. Ha az ellenőrzés hibát talál, `needs_clarification` az állapot, és nincs ajánlat. Különben elkészül az ajánlat; ha a kérésben nincs hűségidő, kettő (12 és 24 hónap).
8. **Árazható?** és a két válasz: a hívó megkapja az ajánlato(ka)t vagy a hibalistát.

## A jóváhagyás és a küldés (`02-jovahagyas-kuldes.json`)

1. **Webhook** (`POST /webhook/ajanlat-jovahagyas`, `{"public_id": ...}`): ezt hívja a demóoldal „Mehet” gombja.
2. **Beállítások:** a PDF-készítő címe, a tároló bucketje, a levélküldő címe és a feladó. Élesítéskor a PDF-készítő címét itt kell átírni.
3. **Jóváhagyás:** `SELECT approve_request(...)`. Csak `priced` állapotú kérést enged tovább; minden másra 409-es válasz megy (`not_found` vagy `not_approvable`). Dupla kattintásra így nem megy két levél.
4. **PDF készítése:** a PDF-készítő megkapja a kérést és az ajánlato(ka)t, vissza egy PDF-fájl jön.
5. **PDF szöveggé:** a fájl bájtjaiból base64 szöveg lesz, mert a Resend JSON-ban így várja a csatolmányt. A fájl maga is megmarad a következő lépésnek (`keepSource: both`).
6. **PDF tárolása** és **PDF tárolva:** a fájl az objektumtároló `ajanlat-demo` bucketjébe kerül az ajánlat sorszámával (`AJ-2026-0001.pdf`), a helye pedig a `requests.pdf_key` oszlopba.
7. **Levél küldhető?** Ha aznap már elment 20 levél, a levél kimarad (`email_skipped` a naplóban), a PDF az oldalról ettől még letölthető. A keret az `approve_request` második paramétere.
8. **Levél küldése:** `POST https://api.resend.com/emails`, a `Resend kulcs` hitelesítő adattal. Utána a kérés állapota `sent`.

**Miért tároljuk a PDF-et:** egy kiküldött ajánlat utólag nem változhat. Ha a letöltéskor újra készülne, egy sablon- vagy cégadat-módosítás után már nem az a fájl jönne le, ami levélben kiment. A demóoldal ezért a tárolt fájlt adja vissza. Teszt igazolja, hogy a tárolt és a kiküldött fájl bájtra azonos.

## A lépésnapló (`request_events`)

Minden elkészült lépés egy sor: melyik kérés, melyik lépés, mikor. A demóoldal ebből rajzolja ki a folyamatot és az órát: fél másodpercenként lekérdezi a saját `public_id`-jához tartozó sorokat.

- A Feldolgozás workflow lépései: `received` → `extracted` → `checked` → `priced` vagy `needs_clarification`.
- A Jóváhagyás és küldés workflow lépései: `approved` → `pdf_stored` → `sent` vagy `email_skipped`.
- A `received` sort a workflow írja, a többit a `process_request` függvény. Az `extracted` időpontja az a pillanat, amikor a modell válasza megérkezett az adatbázishoz.
- Új lépés naplózása bármelyik workflow-ból: `SELECT log_event(<kérésazonosító>, '<lépés>');`
- A sorrend a kódban ellenőrzés, majd árazás (a terv táblázata fordítva számozza).
- A kérést kívülről a `public_id` azonosítja, nem a sorszám, mert a sorszám kitalálható, és így bárki végiglapozhatná mások kéréseit.

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
uv run --with pytest --with httpx --with 'psycopg[binary]' --with pypdf --with boto3 pytest tests/ -v
docker compose --profile test down     # leállítás (az adat megmarad; -v kapcsolóval törlődik is)
```

| Mi | Cím |
|---|---|
| n8n | http://localhost:5679 (első megnyitáskor tulajdonosi fiókot kér) |
| PDF-készítő | http://localhost:8300/docs |
| Postgres | `psql postgresql://ajanlat:ajanlat-dev@127.0.0.1:5544/ajanlat` |
| Objektumtároló (S3 API) | http://localhost:9100, bucket: `ajanlat-demo`, a helyi kulcs a `docker-compose.yml`-ben |

Ha az `db/*.sql` változik, a Postgres magától nem veszi át, mert csak üres adatmappánál futtatja le őket. Két út van:

- **Kézi átvezetés** (ez történt a lépésnaplónál): a változást `psql`-lel kell ráfuttatni a futó adatbázisra (`ALTER TABLE`, `CREATE OR REPLACE FUNCTION`).
- **Újraépítés:** `docker compose --profile test down -v`, majd újra a `setup_local.sh`. **Ez az n8n adatait is törli**, vele a tulajdonosi fiókot és a beírt `LLM kulcs` hitelesítő adatot.

## Amit tudni kell

- **A `tests/setup_local.sh` a hitelesítő adatokat csak akkor tölti be, ha még nincsenek meg**, így a kézzel beírt valódi kulcsokat nem írja felül. A workflow-kat viszont mindig az ál-modellre és az ál-levélküldőre állítja; a valódira a `n8n/*.json` fájlok változatlan importálása állít vissza.

- **Az opencode Go két dolgot kér:** `Authorization: Bearer <kulcs>` fejlécet és `x-opencode-session` fejlécet (enélkül 400-at ad). Az utóbbit a modellhívás csomópontja küldi, kérésenként `ajanlat-<kérésazonosító>` értékkel.
- **Importálás és újraindítás után az n8n még egy ideig a workflow előző közzétett változatát futtatja.** Tíz másodperccel az indulás után még a régi futott, 45 másodperc után már az új. Az okát nem derítettem ki; a `setup_local.sh` ezért 45 másodpercet vár. Ha egy friss importálás után a régi viselkedést látod, várj fél percet, mielőtt hibát keresel.

- **Mérés (2026-10-06, `deepseek-v4.1-flash`, thinking nélkül): 19 / 20.** A kérések: `tests/eval_requests.json`, a futtató: `tests/run_eval.py`, a részletes eredmény: `tests/eval_results.json`. Egy futás, a promptot nem hangoltam a tesztkérésekre. Az egyetlen hiba a 16-os (ékezet nélküli, szleng: „10 telo kene elofizetessel egyutt”): a modell a telefonokat kihagyta, és hiányos ajánlat készült.
- A `pytest` tesztek ál-modellel (`tests/fake_llm.py`) futnak: a bekötést és az árazást igazolják, a promptot nem.
- **A cégnév munkanév** („Kéktorony Telekom Zrt."), nincs ellenőrizve, hogy létezik-e ilyen cég. Egy helyen cserélhető: `pdf-service/main.py`, `COMPANY`.
- **A `tests/dev-credentials.json` jelszava csak a helyi adatbázisé**, valódi kulcs nincs a repóban.
- A workflow-k hitelesítő adatai név szerint: `Ajánlat DB` (Postgres), `LLM kulcs` és `Resend kulcs` (mindkettő Header Auth: `Authorization` = `Bearer <kulcs>`), `PDF tároló` (S3: végpont, kulcspár, `forcePathStyle` bekapcsolva).
