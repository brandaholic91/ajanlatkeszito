#!/usr/bin/env bash
# Helyi tesztkörnyezet: elindít mindent, és betölti a workflow-t úgy, hogy az ál-modellt hívja.
# Futtatás a projekt gyökeréből:  bash tests/setup_local.sh
set -euo pipefail   # bármelyik parancs hibájánál álljon meg

docker compose --profile test up -d --build

# A workflow tesztmásolata: csak a modell címe más (ál-modell a valódi helyett).
sed 's#https://opencode.ai/zen/go/v1/chat/completions#http://fake-llm:8399/v1/chat/completions#' \
    n8n/01-feldolgozas.json > /tmp/ajanlat-wf-test.json
docker compose cp /tmp/ajanlat-wf-test.json n8n:/tmp/wf-test.json

docker compose exec -T n8n n8n import:credentials --input=/tests/dev-credentials.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/wf-test.json
docker compose exec -T n8n n8n publish:workflow --id=ajanlatFeldolgozas

# A közzététel csak újraindítás után él.
docker compose restart n8n
echo "Várok, amíg az n8n elindul..."
until curl -sf localhost:5679/healthz > /dev/null; do sleep 1; done
sleep 8   # a webhook regisztrálása pár másodperccel az indulás után történik meg
echo "Kész. Teszt: uv run --with pytest --with httpx --with 'psycopg[binary]' --with pypdf pytest tests/ -v"
