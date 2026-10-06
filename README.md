# Ajánlatkészítő

Szabad szöveges ajánlatkérésből márkázott PDF-ajánlat. A terv: `~/Obsidian/second-brain/2026-10-06 Ajánlatkészítő terv.md`.

**Állapot (2026-10-06):** helyben mindhárom workflow és a demóoldal kész és tesztelve; a homelabra még semmi nem került. Valódi modellel (opencode Go, `deepseek-v4.1-flash`) a 20 kérésből álló mérés és néhány kézi próba futott; a tesztek ál-modellel, ál-levélküldővel és ál-riasztócsatornával mennek. A harmadik workflow valódi Resenddel és valódi Discorddal még nem futott.

## Mi hol van

| Fájl | Mit csinál |
|---|---|
| `db/01_schema.sql` | A táblák: `products` (árlista), `volume_discounts` (kedvezménysávok), `requests` (kérések), `request_events` (lépésnapló), `quotes` (ajánlatok) |
| `db/02_pricing.sql` | Négy függvény: `check_request` (ellenőrzés), `price_quote` (árazás), `log_event` (egy sor a lépésnaplóba), `process_request` (ellenőrzés és árazás együtt, mentéssel és naplózással) |
| `db/03_seed.sql` | A kitalált árlista: 22 tétel, 12 kedvezménysáv |
| `db/04_approval.sql` | A jóváhagyás adatbázis-oldala: `approve_request` (jóváhagyás, napi levélkerettel), `set_status` (állapotváltás naplózással), `store_pdf_key` (a tárolt PDF helye) |
| `n8n/01-feldolgozas.json` | Az első workflow (1–4. lépés), importálható az n8n-be |
| `n8n/02-jovahagyas-kuldes.json` | A második workflow (5–7. lépés): jóváhagyás, PDF, levél |
| `db/05_followup.sql` | Az utánkövetés adatbázis-oldala: `fail_stuck_requests` (beragadt kérések lezárása), `claim_due_reminders` (kinek jár emlékeztető) |
| `n8n/03-utankovetes-hibakezeles.json` | A harmadik workflow (8. lépés): emlékeztető, beragadt kérések lezárása, riasztás Discordra |
| `pdf-service/main.py` | A PDF-készítő: FastAPI-végpont, amely a sablonból Playwrighttal PDF-et készít |
| `pdf-service/templates/quote.html` | Az ajánlat kinézete (HTML és CSS, Jinja2 sablon) |
| `web/` | A demóoldal (Next.js): egy oldal és négy szerveroldali végpont. Részletek lent, „A demóoldal” alatt |
| `tests/` | Ál-modell, ál-levélküldő és ál-riasztócsatorna (`fake_llm.py`), a helyi környezet beállítása, 38 teszt |
| `samples/minta-ajanlat.pdf` | Egy kész mintaajánlat a terv példakéréséből |
| `docker-compose.yml` | A helyi környezet: Postgres, PDF-készítő, n8n, objektumtároló (RustFS), a demóoldal, és teszthez az ál-modell |

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
2. **Beállítások:** a PDF-készítő címe, a tároló bucketje, a levélküldő címe, a feladó és a napi levélkeret (`daily_mail_limit`, 20). Élesítéskor a PDF-készítő címét itt kell átírni.
3. **Jóváhagyás:** `SELECT approve_request(...)`. Csak `priced` állapotú kérést enged tovább; minden másra 409-es válasz megy (`not_found` vagy `not_approvable`). Dupla kattintásra így nem megy két levél.
4. **PDF készítése:** a PDF-készítő megkapja a kérést és az ajánlato(ka)t, vissza egy PDF-fájl jön.
5. **PDF szöveggé:** a fájl bájtjaiból base64 szöveg lesz, mert a Resend JSON-ban így várja a csatolmányt. A fájl maga is megmarad a következő lépésnek (`keepSource: both`).
6. **PDF tárolása** és **PDF tárolva:** a fájl az objektumtároló `ajanlat-demo` bucketjébe kerül az ajánlat sorszámával (`AJ-2026-0001.pdf`), a helye pedig a `requests.pdf_key` oszlopba.
7. **Levél küldhető?** Ha aznap már elment 20 levél, a levél kimarad (`email_skipped` a naplóban), a PDF az oldalról ettől még letölthető. A keret a Beállítások `daily_mail_limit` értéke; a workflow ezt adja át az `approve_request` második paramétereként. (Ha a függvényt paraméter nélkül hívod, az alapérték ott is 20.)
8. **Levél küldése:** `POST https://api.resend.com/emails`, a `Resend kulcs` hitelesítő adattal. Utána a kérés állapota `sent`.

**Miért tároljuk a PDF-et:** egy kiküldött ajánlat utólag nem változhat. Ha a letöltéskor újra készülne, egy sablon- vagy cégadat-módosítás után már nem az a fájl jönne le, ami levélben kiment. A demóoldal ezért a tárolt fájlt adja vissza. Teszt igazolja, hogy a tárolt és a kiküldött fájl bájtra azonos.

## Az utánkövetés és a hibakezelés (`03-utankovetes-hibakezeles.json`)

Egy workflow, három ág. Az első kettőt az **Időzítő** indítja negyedóránként (vagy a **Kézi indítás**: `POST /webhook/ajanlat-utankovetes`, üres törzzsel), a harmadikat maga az n8n, ha egy futás hibával áll le.

1. **Beragadt kérések.** Ha egy workflow félúton elhal, a kérés `received` vagy `approved` állapotban marad, és magától semmi nem jelöli hibásnak. A `fail_stuck_requests` lezárja (`failed`) azokat, amelyeknél az utolsó lépés óta több mint 10 perc telt el (`stuck_after_minutes`), és ha volt ilyen, egy összesítő riasztás megy. A nézőre váró (`priced`, `needs_clarification`) és a befejezett kérésekhez nem nyúl.
2. **Emlékeztető.** A `claim_due_reminders` kiválasztja azokat a kéréseket, amelyeknek az ajánlata legalább 72 órája elment (`followup_after_hours`), még érvényes, és még nem kaptak emlékeztetőt. Mindegyik egy rövid levelet kap, csatolmány nélkül. **A demóban nincs válaszfigyelés, ezért minden kiküldött ajánlat kap egy emlékeztetőt**, nem csak az, amelyikre nem jött válasz.
   - **Egy kérés legfeljebb egy emlékeztetőt kap.** A `reminded` lépés még a küldés előtt bekerül a naplóba. Fordított sorrendnél, ha a levél elmegy, de a naplózás elhasal, a következő futás újra elküldené, negyedóránként.
   - **Újrapróbálás:** a küldés háromszor próbálkozik, két másodperc szünettel. Ha így sem megy, a workflow nem áll le: az a levél az alsó kimenetre kerül (`reminder_failed` a naplóban, riasztás), a többi kimegy. Később nem próbálja újra.
   - **A napi levélkeret közös** az ajánlatokkal (`daily_mail_limit`, 20): az `approve_request` és a `claim_due_reminders` is a ma elment `sent` és `reminded` lépéseket együtt számolja. Ami nem fér bele, másnap megy.
3. **Hibafigyelés.** Mindhárom workflow beállításában ez a workflow a hibakezelő (`settings.errorWorkflow`). Ha bármelyik futás hibával áll le, a **Hiba egy workflow-ban** csomópont megkapja a workflow nevét, az utolsó csomópontot és a hibaüzenetet, és ezt riasztásként továbbküldi. Maga a kérés ilyenkor félúton marad; azt az 1. ág zárja le legkésőbb 25 perc múlva.

A riasztások a `Riasztás (Discord)` hitelesítő adatban megadott webhook címre mennek. Helyben ez az ál-riasztócsatorna (`http://fake-llm:8399/discord`).

## A demóoldal (`web/`)

Egyetlen oldal: űrlap, élő lépéslista órával, az elkészült ajánlat, a „Mehet” gomb és a PDF letöltése. **A böngésző csak a Next.js alkalmazással beszél.** Az n8n, a Postgres és az objektumtároló a belső hálózaton marad, ezeket a szerveroldali végpontok (route handlerek) érik el. Így a webhookok címe és a tároló kulcsa sosem jut el a böngészőig.

Egy kérés útja a négy végponton:

1. **`POST /api/requests`** (`{"public_id", "email", "text"}`): a böngésző generál egy UUID-t, és ezzel küldi be a kérést. A végpont ellenőrzi a bemenetet (UUID-alak, legfeljebb 2000 karakter, e-mail-alak), megnézi az adatbázisban a napi keretet (`DAILY_REQUEST_LIMIT`, alapból 50; ez a modell költségét védi), majd továbbadja a kérést a Feldolgozás webhooknak. Csak akkor válaszol, amikor a workflow végigfutott.
2. **`GET /api/requests/<public_id>`**: az oldal ezt kérdezi le fél másodpercenként, már az 1. hívás közben is, hiszen az azonosítót ő maga adta. A végpont közvetlenül az adatbázisból olvas: állapot, lépésnapló időpontokkal, az ajánlat(ok) tételsorai és összesítői, a visszakérdezés oka, és hogy van-e már tárolt PDF. A belső sorszám nincs a válaszban. A figyelés megáll, amikor a napló utolsó lépése `priced`, `needs_clarification`, `sent`, `email_skipped`, vagy az utánkövetés valamelyik lépése (`failed`, `reminded`, `reminder_failed`).
3. **`POST /api/requests/<public_id>/approve`**: a „Mehet” gomb. Továbbadja a jóváhagyást a Jóváhagyás és küldés webhooknak; annak a 409-es válaszát (már jóváhagyták, vagy nincs ilyen kérés) 409-ként adja tovább.
4. **`GET /api/requests/<public_id>/pdf`**: kikeresi az adatbázisból a kéréshez tartozó `pdf_key`-t, és a tárolóból folyamként továbbadja a fájlt. A fájl nevét sosem a böngésző adja meg, így mások ajánlatát nem lehet kikérni.

Hibánál minden végpont ugyanilyen alakú választ ad: `{"error": "<kód>", "message": "<magyar szöveg>"}`. Az oldal a `message` mezőt írja ki. A kódok: `invalid_input` és `invalid_id` (400), `not_found` (404), `duplicate` és `not_approvable` (409), `daily_limit` (429), `workflow_unavailable`, `workflow_failed` és `storage_failed` (502), `database_unavailable` (503).

| Hol | Mi van ott |
|---|---|
| `web/app/api/requests/` | A négy végpont, mappánként egy `route.ts` |
| `web/lib/` | A logika, megjelenítés nélkül: adatbázis (`db.ts`), tároló (`s3.ts`), beállítások (`config.ts`), bemenet-ellenőrzés (`validation.ts`), a böngészőoldali hívások (`api-client.ts`), a figyelés (`useRequestStatus.ts`), az óra (`useElapsed.ts`), a lépések magyar neve (`steps.ts`), a közös típusok (`types.ts`) |
| `web/components/` | A megjelenítés kis komponensekben; az állapot egy helyen van, a `Demo.tsx`-ben |
| `web/.env.example` | A hét környezeti változó, helyi értékekkel |

A kinézet a PDF-ajánlat arculatát követi (ugyanazok a színek és a betűtípus); a leírása a `DESIGN.md`-ben, a közönségé és a célé a `PRODUCT.md`-ben van.

## A lépésnapló (`request_events`)

Minden elkészült lépés egy sor: melyik kérés, melyik lépés, mikor. A demóoldal ebből rajzolja ki a folyamatot és az órát: fél másodpercenként lekérdezi a saját `public_id`-jához tartozó sorokat.

- A Feldolgozás workflow lépései: `received` → `extracted` → `checked` → `priced` vagy `needs_clarification`.
- A Jóváhagyás és küldés workflow lépései: `approved` → `pdf_stored` → `sent` vagy `email_skipped`.
- Az Utánkövetés és hibakezelés workflow lépései, percekkel vagy napokkal később: `failed` (beragadt kérés lezárva), `reminded`, `reminder_failed`. Közülük csak a `failed` állapot is; az emlékeztető után a kérés állapota `sent` marad.
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
bash tests/setup_local.sh      # elindít mindent, betölti a három workflow-t az ál-modellel
uv run --with pytest --with httpx --with 'psycopg[binary]' --with pypdf --with boto3 pytest tests/ -v
docker compose --profile test down     # leállítás (az adat megmarad; -v kapcsolóval törlődik is)
```

A demóoldal a többivel együtt indul, és a http://localhost:3000 címen érhető el. Ha csak a `web/` változott, elég azt újraépíteni:

```bash
docker compose --profile test up -d --build --no-deps web
```

Fejlesztéshez gyorsabb a konténer nélküli futtatás, mert mentéskor azonnal frissül (a többi szolgáltatásnak közben futnia kell; a 3000-es portot előbb fel kell szabadítani: `docker compose stop web`):

```bash
cd web
cp .env.example .env.local    # a gépre kivezetett helyi portokra mutat
npm install
npm run dev
```

| Mi | Cím |
|---|---|
| Demóoldal | http://localhost:3000 |
| n8n | http://localhost:5679 (első megnyitáskor tulajdonosi fiókot kér) |
| PDF-készítő | http://localhost:8300/docs |
| Postgres | `psql postgresql://ajanlat:ajanlat-dev@127.0.0.1:5544/ajanlat` |
| Objektumtároló (S3 API) | http://localhost:9100, bucket: `ajanlat-demo`, a helyi kulcs a `docker-compose.yml`-ben |

Ha az `db/*.sql` változik, a Postgres magától nem veszi át, mert csak üres adatmappánál futtatja le őket. Két út van:

- **Kézi átvezetés** (ez történt a lépésnaplónál): a változást `psql`-lel kell ráfuttatni a futó adatbázisra (`ALTER TABLE`, `CREATE OR REPLACE FUNCTION`).
- **Újraépítés:** `docker compose --profile test down -v`, majd újra a `setup_local.sh`. **Ez az n8n adatait is törli**, vele a tulajdonosi fiókot és a beírt `LLM kulcs` hitelesítő adatot.

## Amit tudni kell

- **A `tests/setup_local.sh` a hitelesítő adatokat csak akkor tölti be, ha még nincsenek meg**, így a kézzel beírt valódi kulcsokat nem írja felül. A workflow-kat viszont mindig az ál-modellre és az ál-levélküldőre állítja, a napi levélkeretet pedig 100000-re; a valódi címekre és a 20-as keretre a `n8n/*.json` fájlok változatlan importálása állít vissza. Ha a tesztmásolatban valódi külső cím maradna, a szkript megáll, és nem tölti be.

- **Ha a helyi workflow-k a valódi Resendre mutatnak, az Utánkövetés negyedóránként valódi emlékeztetőt küld** minden három napnál régebbi, `sent` állapotú helyi kérésre, a tesztek `@example.com` címeire is (naponta legfeljebb 20-at). A valódi címekre ezért csak annyi időre érdemes átállni, amíg a próba tart, vagy közben az Utánkövetés workflow-t ki kell kapcsolni az n8n felületén.
- **A `Riasztás (Discord)` hitelesítő adat külön fájlból töltődik be** (`tests/dev-credentials-alert.json`), mert később került a projektbe: így egy már beállított helyi n8n-be egyedül is betölthető. Valódi riasztáshoz a Discord webhook címét az n8n felületén kell beírni a helyére.
- **A tesztek az emlékeztetőt visszadátumozással próbálják ki** (a `sent` lépés időpontját írják át), nem várnak három napot. Mellékhatás: minden tesztfutás lezárja a helyi adatbázisban talált összes beragadt kérést, és „elküldi” az összes esedékes emlékeztetőt az ál-levélküldőnek.
- **Az opencode Go két dolgot kér:** `Authorization: Bearer <kulcs>` fejlécet és `x-opencode-session` fejlécet (enélkül 400-at ad). Az utóbbit a modellhívás csomópontja küldi, kérésenként `ajanlat-<kérésazonosító>` értékkel.
- **Importálás és újraindítás után az n8n még egy ideig a workflow előző közzétett változatát futtatja.** Tíz másodperccel az indulás után még a régi futott, 45 másodperc után már az új. Az okát nem derítettem ki; a `setup_local.sh` ezért 45 másodpercet vár. Ha egy friss importálás után a régi viselkedést látod, várj fél percet, mielőtt hibát keresel.

- **Mérés (2026-10-06, `deepseek-v4.1-flash`, thinking nélkül): 19 / 20.** A kérések: `tests/eval_requests.json`, a futtató: `tests/run_eval.py`, a részletes eredmény: `tests/eval_results.json`. Egy futás, a promptot nem hangoltam a tesztkérésekre. Az egyetlen hiba a 16-os (ékezet nélküli, szleng: „10 telo kene elofizetessel egyutt”): a modell a telefonokat kihagyta, és hiányos ajánlat készült.
- A `pytest` tesztek ál-modellel (`tests/fake_llm.py`) futnak: a bekötést és az árazást igazolják, a promptot nem.
- **A helyi workflow napi levélkerete 100000, a repóban lévő fájlé 20.** Minden tesztfutás négy levelet „küld” az ál-levélküldőnek, ezért a 20-as kerettel a tesztek a nap ötödik futása körül elbuktak (`email_skipped`). A `setup_local.sh` most betöltéskor átírja a keretet, ugyanúgy, ahogy a két külső címet. Magát a szabályt két teszt védi, és egyik sem függ attól, hány levél ment el aznap: a `test_daily_mail_limit_turns_off_sending` a keretet maga adja meg az `approve_request`-nek, a `test_default_daily_mail_limit_is_20` pedig azt nézi, hogy a függvény alapértéke és a repóban lévő workflow beállítása is 20.
- **A helyi `web` szolgáltatásnál a napi kéréskeret ki van kapcsolva** (`DAILY_REQUEST_LIMIT: "100000"` a `docker-compose.yml`-ben), mert minden tesztfutás kb. 15 kérést hoz létre. Élesben 50 legyen.
- **Az oldal azonosítót a böngészővel generáltat (`crypto.randomUUID`), ez csak HTTPS-en vagy `localhost`-on működik.** Sima HTTP-n, IP-címen megnyitva a beküldés hibát dob.
- A beküldés utáni első lekérdezés 404-et kaphat, mert az n8n még nem írta be a kérést. Ez várt, az oldal kezeli; a böngésző konzoljában ettől még látszik egy 404-es sor.
- **A cégnév munkanév** („Kéktorony Telekom Zrt."), nincs ellenőrizve, hogy létezik-e ilyen cég. Egy helyen cserélhető: `pdf-service/main.py`, `COMPANY`.
- **A `tests/dev-credentials.json` jelszava csak a helyi adatbázisé**, valódi kulcs nincs a repóban.
- A workflow-k hitelesítő adatai név szerint: `Ajánlat DB` (Postgres), `LLM kulcs` és `Resend kulcs` (mindkettő Header Auth: `Authorization` = `Bearer <kulcs>`), `PDF tároló` (S3: végpont, kulcspár, `forcePathStyle` bekapcsolva), `Riasztás (Discord)` (Discord Webhook: a webhook címe).
