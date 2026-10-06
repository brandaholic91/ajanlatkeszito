"""Mérés: a 20 tesztkérést végigküldi a workflow-n, és megnézi, hányat talált el a rendszer.

Futtatás (a VALÓDI modellt hívja, tehát a kulcs keretéből fogyaszt):
    uv run --with httpx --with 'psycopg[binary]' python tests/run_eval.py

Egy kérés akkor "talált", ha
  - az állapot egyezik (ajánlat készült / visszakérdezés), és
  - ajánlatnál ugyanazok a hűségidő-változatok készültek el, és mindegyik
    teljes szerződéses értéke forintra egyezik a várttal.
A várt végösszeget az adatbázis számolja a kézzel megadott helyes tétellistából.
"""

import json
import time
from pathlib import Path

import httpx
import psycopg

DB = "postgresql://ajanlat:ajanlat-dev@127.0.0.1:5544/ajanlat"
WEBHOOK = "http://127.0.0.1:5679/webhook/ajanlatkeres"
HERE = Path(__file__).parent


def expected_totals(db, expect):
    """A helyes tétellistából kiszámolja a várt végösszeget minden változatra: {12: ..., 24: ...}."""
    items = [{"sku": sku, "qty": qty} for sku, qty in expect["items"].items()]
    terms = [expect["term_months"]] if expect["term_months"] else [12, 24]
    totals = {}
    for term in terms:
        priced = db.execute("SELECT price_quote(%s::jsonb, %s)", (json.dumps(items), term)).fetchone()[0]
        totals[term] = priced["totals"]["contract_net"]
    return totals


def main():
    cases = json.loads((HERE / "eval_requests.json").read_text())
    results = []
    with psycopg.connect(DB) as db:
        for case in cases:
            expect = case["expect"]
            started = time.time()
            try:
                answer = httpx.post(WEBHOOK, json={"email": "meres@example.com", "text": case["text"]}, timeout=90).json()
            except Exception as error:  # hálózati hiba, időtúllépés, nem JSON válasz
                answer = {"status": "error", "message": str(error)}
            seconds = round(time.time() - started, 1)

            got_status = answer.get("status", "error")
            got_totals = {q["term_months"]: q["priced"]["totals"]["contract_net"] for q in answer.get("quotes", [])}
            # mit olvasott ki a modell: az első változat sorai (a tételek minden változatban azonosak)
            got_items = {l["sku"]: l["qty"] for l in answer["quotes"][0]["priced"]["lines"]} if answer.get("quotes") else {}

            want_totals = expected_totals(db, expect) if expect["status"] == "priced" else {}
            ok = got_status == expect["status"] and got_totals == want_totals

            results.append({
                "id": case["id"], "headcount": case["headcount"], "ok": ok, "seconds": seconds,
                "want_status": expect["status"], "got_status": got_status,
                "want_items": expect.get("items", {}), "got_items": got_items,
                "want_totals": want_totals, "got_totals": got_totals,
                "problems": answer.get("problems", []), "message": answer.get("message"),
            })
            print(f"{case['id']:>2}  {'OK  ' if ok else 'HIBA'}  {seconds:>5}s  {got_status}")
            if not ok:
                print("      várt: ", expect.get("items") or expect["status"])
                print("      kapott:", got_items or answer.get("problems") or answer.get("message"))

    hits = sum(r["ok"] for r in results)
    print(f"\nTalálat: {hits} / {len(results)}")
    (HERE / "eval_results.json").write_text(json.dumps(
        {"run_at": time.strftime("%Y-%m-%d %H:%M"), "hits": hits, "total": len(results), "results": results},
        ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
