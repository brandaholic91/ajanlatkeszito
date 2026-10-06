#!/usr/bin/env bash
# Helyi tesztkörnyezet: elindít mindent, és betölti a workflow-kat úgy, hogy az ál-modellt és az ál-levélküldőt hívják.
# Futtatás a projekt gyökeréből:  bash tests/setup_local.sh
set -euo pipefail   # bármelyik parancs hibájánál álljon meg

docker compose --profile test up -d --build

# A hitelesítő adatokat csak akkor tölti be, ha még nincsenek meg, különben felülírná a kézzel beírt valódi kulcsokat.
if ! docker compose exec -T n8n n8n export:credentials --all 2>/dev/null | grep -q ajanlatDbCred0001; then
    docker compose exec -T n8n n8n import:credentials --input=/tests/dev-credentials.json
fi

# A workflow-k tesztmásolata: csak a két külső cím más (ál-modell és ál-levélküldő a valódiak helyett).
for file in n8n/*.json; do
    sed -e 's#https://opencode.ai/zen/go/v1/chat/completions#http://fake-llm:8399/v1/chat/completions#' \
        -e 's#https://api.resend.com/emails#http://fake-llm:8399/emails#' \
        "$file" > /tmp/ajanlat-wf-test.json
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
