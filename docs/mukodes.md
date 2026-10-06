# Működés részletesen

A három workflow, a demóoldal végpontjai, a lépésnapló és az árazás szabályai. A rövid áttekintés a [README](../README.md)-ben van, a helyi futtatás a [fejlesztes.md](fejlesztes.md)-ben.

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
| `n8n/03-utankovetes-hibakezeles.json` | A harmadik workflow (8. lépés): emlékeztető, beragadt kérések lezárása, lejárt kérések törlése, riasztás Discordra |
| `db/06_retention.sql` | Az adatmegőrzés adatbázis-oldala: `expired_requests` (melyik kérés járt le), `delete_expired_request` (egy lejárt kérés törlése) |
| `pdf-service/main.py` | A PDF-készítő: FastAPI-végpont, amely a sablonból Playwrighttal PDF-et készít |
| `pdf-service/templates/quote.html` | Az ajánlat kinézete (HTML és CSS, Jinja2 sablon) |
| `web/` | A demóoldal (Next.js): a főoldal, az adatkezelési tájékoztató és négy szerveroldali végpont. Részletek lent, „A demóoldal” alatt |
| `tests/` | Ál-modell, ál-levélküldő és ál-riasztócsatorna (`fake_llm.py`), a helyi környezet beállítása, 41 teszt |
| `samples/minta-ajanlat.pdf` | Egy kész mintaajánlat a terv példakéréséből |
| `docker-compose.prod.yml` | Az éles környezet: adatbázis, PDF-készítő és demóoldal; az n8n és az objektumtároló külön gépen fut, a címeket és a jelszavakat környezeti változók adják |
| `docker-compose.yml` | A helyi környezet: Postgres, PDF-készítő, n8n, objektumtároló (RustFS), a demóoldal, és teszthez az ál-modell |

## A feldolgozás (`01-feldolgozas.json`)

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
2. **Beállítások:** a PDF-készítő címe, a tároló bucketje, a levélküldő címe, a feladó és a napi levélkeret (`daily_mail_limit`, 40). Élesítéskor a PDF-készítő címét itt kell átírni.
3. **Jóváhagyás:** `SELECT approve_request(...)`. Csak `priced` állapotú kérést enged tovább; minden másra 409-es válasz megy (`not_found` vagy `not_approvable`). Dupla kattintásra így nem megy két levél.
4. **PDF készítése:** a PDF-készítő megkapja a kérést és az ajánlato(ka)t, vissza egy PDF-fájl jön.
5. **PDF szöveggé:** a fájl bájtjaiból base64 szöveg lesz, mert a Resend JSON-ban így várja a csatolmányt. A fájl maga is megmarad a következő lépésnek (`keepSource: both`).
6. **PDF tárolása** és **PDF tárolva:** a fájl az objektumtároló `ajanlat-demo` bucketjébe kerül az ajánlat sorszámával (`AJ-2026-0001.pdf`), a helye pedig a `requests.pdf_key` oszlopba.
7. **Levél küldhető?** Ha aznap már elment 40 levél, a levél kimarad (`email_skipped` a naplóban), a PDF az oldalról ettől még letölthető. A keret a Beállítások `daily_mail_limit` értéke; a workflow ezt adja át az `approve_request` második paramétereként. (Ha a függvényt paraméter nélkül hívod, az alapérték ott is 40.)
8. **Levél küldése:** `POST https://api.resend.com/emails`, a `Resend kulcs` hitelesítő adattal. Utána a kérés állapota `sent`.

**Miért tároljuk a PDF-et:** egy kiküldött ajánlat utólag nem változhat. Ha a letöltéskor újra készülne, egy sablon- vagy cégadat-módosítás után már nem az a fájl jönne le, ami levélben kiment. A demóoldal ezért a tárolt fájlt adja vissza. Teszt igazolja, hogy a tárolt és a kiküldött fájl bájtra azonos.

## Az utánkövetés és a hibakezelés (`03-utankovetes-hibakezeles.json`)

Egy workflow, négy ág. Az első hármat az **Időzítő** indítja percenként (vagy a **Kézi indítás**: `POST /webhook/ajanlat-utankovetes`, üres törzzsel), a negyediket maga az n8n, ha egy futás hibával áll le.

1. **Beragadt kérések.** Ha egy workflow félúton elhal, a kérés `received` vagy `approved` állapotban marad, és magától semmi nem jelöli hibásnak. A `fail_stuck_requests` lezárja (`failed`) azokat, amelyeknél az utolsó lépés óta több mint 10 perc telt el (`stuck_after_minutes`), és ha volt ilyen, egy összesítő riasztás megy. A nézőre váró (`priced`, `needs_clarification`) és a befejezett kérésekhez nem nyúl.
2. **Emlékeztető.** A `claim_due_reminders` kiválasztja azokat a kéréseket, amelyeknek az ajánlata legalább 2 perce elment (`followup_after_minutes`), még érvényes, és még nem kaptak emlékeztetőt. A 2 perc a demó miatt ennyi, hogy a néző kivárhassa; éles működésnél 72 óra lenne (4320 perc), és az időzítőnek is elég volna negyedóránként futnia. Mindegyik egy rövid levelet kap, csatolmány nélkül. **A demóban nincs válaszfigyelés, ezért minden kiküldött ajánlat kap egy emlékeztetőt**, nem csak az, amelyikre nem jött válasz.
   - **Egy kérés legfeljebb egy emlékeztetőt kap.** A `reminded` lépés még a küldés előtt bekerül a naplóba. Fordított sorrendnél, ha a levél elmegy, de a naplózás elhasal, a következő futás újra elküldené, percenként.
   - **Újrapróbálás:** a küldés háromszor próbálkozik, két másodperc szünettel. Ha így sem megy, a workflow nem áll le: az a levél az alsó kimenetre kerül (`reminder_failed` a naplóban, riasztás), a többi kimegy. Később nem próbálja újra.
   - **A napi levélkeret közös** az ajánlatokkal (`daily_mail_limit`, 40): az `approve_request` és a `claim_due_reminders` is a ma elment `sent` és `reminded` lépéseket együtt számolja. Ami nem fér bele, másnap megy.
3. **Lejárt kérések törlése.** Az `expired_requests` kiválasztja a 14 napnál régebbi kéréseket (`delete_after_days`), futásonként legfeljebb 50-et. Mindegyiknél előbb a tárolt PDF törlődik az objektumtárolóból, utána a `delete_expired_request` törli a kérést a lépésnaplójával és az ajánlataival együtt. Az oldal adatkezelési tájékoztatója ezt a 14 napot ígéri; ha a beállítás változik, a tájékoztató szövegét (`web/app/adatkezeles/page.tsx`) is át kell írni.
   - **A sorrend számít.** A PDF helyét a kérés sora őrzi. Ha a sor törlődne előbb, és a PDF törlése utána elhasalna, a fájl a tárolóban maradna, és semmi nem mutatna rá. Így a sor megmarad, és a következő futás újra megpróbálja.
   - **A törlő függvény a kort maga is ellenőrzi**, ezért friss kérést akkor sem töröl, ha közvetlenül, rossz azonosítóval hívják.
   - **Ha a tároló nem érhető el**, a futás hibával áll le, és erről riasztás megy. Amíg a hiba fennáll, ez percenként ismétlődik.
4. **Hibafigyelés.** Mindhárom workflow beállításában ez a workflow a hibakezelő (`settings.errorWorkflow`). Ha bármelyik futás hibával áll le, a **Hiba egy workflow-ban** csomópont megkapja a workflow nevét, az utolsó csomópontot és a hibaüzenetet, és ezt riasztásként továbbküldi. Maga a kérés ilyenkor félúton marad; azt az 1. ág zárja le legkésőbb 11 perc múlva (10 perc a határidő, és az időzítő percenként fut).

A riasztások a `Riasztás (Discord)` hitelesítő adatban megadott webhook címre mennek. Helyben ez az ál-riasztócsatorna (`http://fake-llm:8399/discord`).

## A demóoldal (`web/`)

A főoldal: űrlap, élő lépéslista órával, az elkészült ajánlat, a „Mehet” gomb és a PDF letöltése. Mellette egy szöveges oldal van, az adatkezelési tájékoztató (`/adatkezeles`). **A böngésző csak a Next.js alkalmazással beszél.** Az n8n, a Postgres és az objektumtároló a belső hálózaton marad, ezeket a szerveroldali végpontok (route handlerek) érik el. Így a webhookok címe és a tároló kulcsa sosem jut el a böngészőig.

Egy kérés útja a négy végponton:

1. **`POST /api/requests`** (`{"public_id", "email", "text"}`): a böngésző generál egy UUID-t, és ezzel küldi be a kérést. A végpont ellenőrzi a bemenetet (UUID-alak, legfeljebb 2000 karakter, e-mail-alak), megnézi az adatbázisban a napi keretet (`DAILY_REQUEST_LIMIT`, alapból 50; ez a modell költségét védi), majd továbbadja a kérést a Feldolgozás webhooknak. Csak akkor válaszol, amikor a workflow végigfutott.
2. **`GET /api/requests/<public_id>`**: az oldal ezt kérdezi le fél másodpercenként, már az 1. hívás közben is, hiszen az azonosítót ő maga adta. A végpont közvetlenül az adatbázisból olvas: állapot, lépésnapló időpontokkal, az ajánlat(ok) tételsorai és összesítői, a visszakérdezés oka, és hogy van-e már tárolt PDF. A belső sorszám nincs a válaszban. A figyelés megáll, amikor a napló utolsó lépése `priced`, `needs_clarification`, `email_skipped`, vagy az utánkövetés valamelyik lépése (`failed`, `reminded`, `reminder_failed`). A `sent` után az oldal még legfeljebb 10 percig figyel, 5 másodpercenként, hogy az emlékeztető is megjelenjen a naplóban.
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
