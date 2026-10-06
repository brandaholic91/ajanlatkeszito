#!/usr/bin/env bash
# Helyi tesztkörnyezet: elindít mindent, és betölti a workflow-kat úgy, hogy az ál-modellt és az ál-levélküldőt hívják,
# a napi levélkeret pedig ne fogyjon el a tesztektől.
# Futtatás a projekt gyökeréből:  bash tests/setup_local.sh
set -euo pipefail   # bármelyik parancs hibájánál álljon meg

docker compose --profile test up -d --build

# A hitelesítő adatokat csak akkor tölti be, ha még nincsenek meg, különben felülírná a kézzel beírt valódi kulcsokat.
# Az export --decrypted nélkül titkosítva adja ki az adatot, és a kimenet csak egy változóba kerül, a képernyőre nem.
# Három eset van, és csak a biztosan üresnél importál: ha az n8n nem válaszol érthetően, inkább megáll.
creds=$(docker compose exec -T n8n n8n export:credentials --all 2>&1 || true)
if grep -q ajanlatDbCred0001 <<< "$creds"; then
    echo "A hitelesítő adatok már megvannak, nem nyúlok hozzájuk."
elif grep -q "No credentials found" <<< "$creds"; then
    docker compose exec -T n8n n8n import:credentials --input=/tests/dev-credentials.json
else
    echo "Nem tudtam megállapítani, vannak-e már hitelesítő adatok az n8n-ben. Megállok, hogy semmit ne írjak felül." >&2
    exit 1
fi
unset creds

# A workflow-k tesztmásolata. Három dolog más bennük, mint a repóban lévő fájlokban:
#   - a modell címe az ál-modellre mutat,
#   - a levélküldő címe az ál-levélküldőre,
#   - a napi levélkeret (daily_mail_limit) 20 helyett 100000, hogy a tesztek sose fogyasszák el.
# A harmadik sed-szabály jelentése: keresd meg a "daily_mail_limit" sort, lépj a következőre (n), és ott cseréld a 20-at.
for file in n8n/*.json; do
    sed -e 's#https://opencode.ai/zen/go/v1/chat/completions#http://fake-llm:8399/v1/chat/completions#' \
        -e 's#https://api.resend.com/emails#http://fake-llm:8399/emails#' \
        -e '/"name": "daily_mail_limit"/{n;s/"value": 20,/"value": 100000,/}' \
        "$file" > /tmp/ajanlat-wf-test.json
    # Biztosíték: ha a fájl formája megváltozott, és valamelyik csere nem történt meg, ne töltsük be.
    if grep -q -e 'opencode.ai' -e 'api.resend.com' /tmp/ajanlat-wf-test.json; then
        echo "$file: a tesztmásolatban valódi külső cím maradt, nem töltöm be." >&2
        exit 1
    fi
    if grep -q -A1 '"name": "daily_mail_limit"' /tmp/ajanlat-wf-test.json \
       && ! grep -A1 '"name": "daily_mail_limit"' /tmp/ajanlat-wf-test.json | grep -q '"value": 100000,'; then
        echo "$file: a napi levélkeretet nem sikerült átírni, nem töltöm be." >&2
        exit 1
    fi
    docker compose cp /tmp/ajanlat-wf-test.json n8n:/tmp/wf-test.json
    docker compose exec -T n8n n8n import:workflow --input=/tmp/wf-test.json
done
docker compose exec -T n8n n8n publish:workflow --id=ajanlatFeldolgozas
docker compose exec -T n8n n8n publish:workflow --id=ajanlatJovahagyas

# A közzététel csak újraindítás után él.
docker compose restart n8n
echo "Várok, amíg az n8n elindul..."
until curl -sf localhost:5679/healthz > /dev/null; do sleep 1; done
sleep 45  # az n8n az indulás után még fél percig a workflow-k előző közzétett változatát futtathatja
echo "Kész. Teszt: uv run --with pytest --with httpx --with 'psycopg[binary]' --with pypdf --with boto3 pytest tests/ -v"
