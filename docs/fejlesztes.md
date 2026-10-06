# Fejlesztés és helyi futtatás

Hogyan indul el a projekt a saját gépeden, és mire kell figyelni közben. A működés leírása a [mukodes.md](mukodes.md)-ben van.

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

- **A `tests/setup_local.sh` a hitelesítő adatokat csak akkor tölti be, ha még nincsenek meg**, így a kézzel beírt valódi kulcsokat nem írja felül. A workflow-kat viszont mindig az ál-modellre és az ál-levélküldőre állítja, a napi levélkeretet pedig 100000-re; a valódi címekre és a 40-es keretre a `n8n/*.json` fájlok változatlan importálása állít vissza. Ha a tesztmásolatban valódi külső cím maradna, a szkript megáll, és nem tölti be.

- **Ha a helyi workflow-k a valódi Resendre mutatnak, az Utánkövetés valódi emlékeztetőt küld** minden két percnél régebbi, `sent` állapotú helyi kérésre, a tesztek `@example.com` címeire is (naponta legfeljebb 40-et). A valódi címekre ezért csak annyi időre érdemes átállni, amíg a próba tart, vagy közben az Utánkövetés workflow-t ki kell kapcsolni az n8n felületén.
- **A `Riasztás (Discord)` hitelesítő adat külön fájlból töltődik be** (`tests/dev-credentials-alert.json`), mert később került a projektbe: így egy már beállított helyi n8n-be egyedül is betölthető. Valódi riasztáshoz a Discord webhook címét az n8n felületén kell beírni a helyére.
- **A tesztek az emlékeztetőt visszadátumozással próbálják ki** (a `sent` lépés időpontját írják át), nem várnak két percet. Mellékhatás: minden tesztfutás lezárja a helyi adatbázisban talált összes beragadt kérést, és „elküldi” az összes esedékes emlékeztetőt az ál-levélküldőnek.
- **Az opencode Go két dolgot kér:** `Authorization: Bearer <kulcs>` fejlécet és `x-opencode-session` fejlécet (enélkül 400-at ad). Az utóbbit a modellhívás csomópontja küldi, kérésenként `ajanlat-<kérésazonosító>` értékkel.
- **Importálás és újraindítás után az n8n még egy ideig a workflow előző közzétett változatát futtatja.** Tíz másodperccel az indulás után még a régi futott, 45 másodperc után már az új. Az okát nem derítettem ki; a `setup_local.sh` ezért 45 másodpercet vár. Ha egy friss importálás után a régi viselkedést látod, várj fél percet, mielőtt hibát keresel.

- **Mérés (2026-10-06, `deepseek-v4.1-flash`, thinking nélkül): 19 / 20.** A kérések: `tests/eval_requests.json`, a futtató: `tests/run_eval.py`, a részletes eredmény: `tests/eval_results.json`. Egy futás, a promptot nem hangoltam a tesztkérésekre. Az egyetlen hiba a 16-os (ékezet nélküli, szleng: „10 telo kene elofizetessel egyutt”): a modell a telefonokat kihagyta, és hiányos ajánlat készült.
- A `pytest` tesztek ál-modellel (`tests/fake_llm.py`) futnak: a bekötést és az árazást igazolják, a promptot nem.
- **A helyi workflow napi levélkerete 100000, a repóban lévő fájlé 40.** Minden tesztfutás négy levelet „küld” az ál-levélküldőnek, ezért az akkori 20-as kerettel a tesztek a nap ötödik futása körül elbuktak (`email_skipped`). A `setup_local.sh` most betöltéskor átírja a keretet, ugyanúgy, ahogy a két külső címet. Magát a szabályt két teszt védi, és egyik sem függ attól, hány levél ment el aznap: a `test_daily_mail_limit_turns_off_sending` a keretet maga adja meg az `approve_request`-nek, a `test_default_daily_mail_limit_is_40` pedig azt nézi, hogy a függvény alapértéke és a repóban lévő workflow beállítása is 40.
- **A helyi `web` szolgáltatásnál a napi kéréskeret ki van kapcsolva** (`DAILY_REQUEST_LIMIT: "100000"` a `docker-compose.yml`-ben), mert minden tesztfutás kb. 15 kérést hoz létre. Élesben 50 legyen.
- **Az oldal azonosítót a böngészővel generáltat (`crypto.randomUUID`), ez csak HTTPS-en vagy `localhost`-on működik.** Sima HTTP-n, IP-címen megnyitva a beküldés hibát dob.
- A beküldés utáni első lekérdezés 404-et kaphat, mert az n8n még nem írta be a kérést. Ez várt, az oldal kezeli; a böngésző konzoljában ettől még látszik egy 404-es sor.
- **A cégnév munkanév** („Kéktorony Telekom Zrt."), nincs ellenőrizve, hogy létezik-e ilyen cég. Egy helyen cserélhető: `pdf-service/main.py`, `COMPANY`.
- **A `tests/dev-credentials.json` jelszava csak a helyi adatbázisé**, valódi kulcs nincs a repóban.
- A workflow-k hitelesítő adatai név szerint: `Ajánlat DB` (Postgres), `LLM kulcs` és `Resend kulcs` (mindkettő Header Auth: `Authorization` = `Bearer <kulcs>`), `PDF tároló` (S3: végpont, kulcspár, `forcePathStyle` bekapcsolva), `Riasztás (Discord)` (Discord Webhook: a webhook címe).
