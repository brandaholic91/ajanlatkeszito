"""Ál-modell (a /emails címen ál-levélküldő, a /discord címen ál-riasztócsatorna) a helyi teszthez: úgy válaszol, mint egy chat/completions végpont, de kulcs és hálózat nélkül.

Csak arra jó, hogy a workflow bekötését ellenőrizzük vele (jó helyre megy-e a kérés,
benne van-e az árlista, a válaszból lesz-e ajánlat). A kiolvasás minőségét NEM méri, azt csak valódi modell tudja.
"""

import base64
import hashlib
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

MAILED = {}  # fájlnév -> a csatolmány SHA-256 ujjlenyomata
SUBJECTS = {}  # címzett -> a neki "küldött" levelek tárgya, sorrendben
ALERTS = []  # a /discord címre érkezett riasztások szövege, sorrendben

# Hibák kipróbálásához: ezekre szándékosan 500-at ad, mintha a külső szolgáltatás állna.
BROKEN_REQUEST_WORD = "hibateszt"  # ha ez áll az ajánlatkérés szövegében, a "modell" nem válaszol
BROKEN_MAIL_WORD = "visszapattan"  # ha ez áll a címzettben, a "levélküldő" nem fogadja a levelet

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path.endswith("/emails"):
            return self.fake_mail(body)
        if self.path.endswith("/discord"):
            ALERTS.append(body.get("content", ""))
            return self.reply(200, {"id": "al-riasztas-azonosito"})
        system, user = body["messages"][0]["content"], body["messages"][1]["content"]
        if BROKEN_REQUEST_WORD in user:
            return self.reply(500, {"error": "szándékos hiba a teszthez"})
        if "MOB-PLUS | " not in system or "[[CATALOG]]" in system:
            content = "HIBA: az árlista nem került be a promptba"
        else:
            answer = next((a for key, a in ANSWERS.items() if key in user), None)
            # a keret szándékos: a valódi modell is néha ```json ... ``` közé teszi a választ
            content = "```json\n" + json.dumps(answer, ensure_ascii=False) + "\n```" if answer else "ezt nem értem"
        self.reply(200, {"choices": [{"message": {"role": "assistant", "content": content}}]})

    def fake_mail(self, body):
        """Ál-levélküldő: nem küld semmit, csak ellenőrzi, hogy a kérés olyan-e, amilyet a Resend vár."""
        problems = []
        if not self.headers.get("Authorization", "").startswith("Bearer "):
            problems.append("hiányzik a Bearer kulcs")
        if "@" not in body.get("from", ""):
            problems.append("hiányzik a feladó")
        if not (isinstance(body.get("to"), list) and body["to"] and "@" in body["to"][0]):
            problems.append("hiányzik a címzett")
        if not body.get("subject"):
            problems.append("hiányzik a tárgy")
        # Csatolmány csak az ajánlat levelében van, az emlékeztetőben nincs. Ha van, PDF-nek kell lennie.
        attachment = None
        if "attachments" in body:
            try:
                attachment = body["attachments"][0]
                if not base64.b64decode(attachment["content"]).startswith(b"%PDF"):
                    problems.append("a csatolmány nem PDF")
                if not attachment["filename"].endswith(".pdf"):
                    problems.append("a csatolmány neve nem .pdf")
            except (KeyError, IndexError, ValueError):
                problems.append("hibás a csatolmány")
        if problems:
            return self.reply(422, {"message": "; ".join(problems)})
        if BROKEN_MAIL_WORD in body["to"][0]:
            return self.reply(500, {"message": "szándékos hiba a teszthez"})
        if attachment:
            # megjegyzi a csatolmány ujjlenyomatát, hogy a teszt össze tudja vetni a tárolt fájléval
            MAILED[attachment["filename"]] = hashlib.sha256(base64.b64decode(attachment["content"])).hexdigest()
        SUBJECTS.setdefault(body["to"][0], []).append(body["subject"])
        self.reply(200, {"id": "al-level-azonosito"})

    def do_GET(self):
        """A tesztek innen kérdezik le, mit kapott az ál-levélküldő és az ál-riasztócsatorna.

        GET /discord            -> az eddigi riasztások szövege
        GET /subjects/<címzett> -> a címzettnek küldött levelek tárgya
        GET /emails/<fájlnév>   -> az utoljára ilyen néven kapott csatolmány SHA-256 ujjlenyomata
        """
        if self.path.endswith("/discord"):
            return self.reply(200, {"alerts": ALERTS})
        if "/subjects/" in self.path:
            return self.reply(200, {"subjects": SUBJECTS.get(self.path.rsplit("/", 1)[-1], [])})
        filename = self.path.rsplit("/", 1)[-1]
        self.reply(200 if filename in MAILED else 404, {"sha256": MAILED.get(filename)})

    def reply(self, status, data):
        reply = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)


HTTPServer(("0.0.0.0", 8399), Handler).serve_forever()
