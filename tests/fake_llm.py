"""Ál-modell a helyi teszthez: úgy válaszol, mint egy chat/completions végpont, de kulcs és hálózat nélkül.

Csak arra jó, hogy a workflow bekötését ellenőrizzük vele (jó helyre megy-e a kérés,
benne van-e az árlista, a válaszból lesz-e ajánlat). A kiolvasás minőségét NEM méri, azt csak valódi modell tudja.
"""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

ANSWERS = {
    # kulcsszó a kérésben -> amit az ál-modell "kiolvas"
    "40 mobil": {
        "items": [
            {"sku": "MOB-PLUS", "qty": 30, "source": "40 mobil-előfizetés, ebből 10 korlátlan"},
            {"sku": "MOB-MAX", "qty": 10, "source": "10 korlátlan adattal"},
            {"sku": "NET-1000", "qty": 1, "source": "gigabites internet"},
            {"sku": "DEV-LAPTOP-STD", "qty": 15, "source": "15 laptop"},
            {"sku": "CLD-MAIL", "qty": 40, "source": "céges levelezés"},
        ],
        "unknown": [], "term_months": None, "deadline": None, "headcount": 40,
    },
    "drón": {
        "items": [{"sku": "MOB-START", "qty": 5, "source": "5 mobil"}],
        "unknown": [{"text": "2 drón"}], "term_months": 24, "deadline": None, "headcount": None,
    },
}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        system, user = body["messages"][0]["content"], body["messages"][1]["content"]
        if "MOB-PLUS | " not in system or "[[CATALOG]]" in system:
            content = "HIBA: az árlista nem került be a promptba"
        else:
            answer = next((a for key, a in ANSWERS.items() if key in user), None)
            # a keret szándékos: a valódi modell is néha ```json ... ``` közé teszi a választ
            content = "```json\n" + json.dumps(answer, ensure_ascii=False) + "\n```" if answer else "ezt nem értem"
        reply = json.dumps({"choices": [{"message": {"role": "assistant", "content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)


HTTPServer(("0.0.0.0", 8399), Handler).serve_forever()
