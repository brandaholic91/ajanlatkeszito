// GET /api/requests/[publicId]: egy kérés állapota. Ezt kérdezi le az oldal fél másodpercenként.
// A szögletes zárójeles mappa ([publicId]) változó útvonalrész: bármi állhat a helyén, és paraméterként megkapjuk.
import { query } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import type { Quote, QuoteLine, QuoteTotals, RequestEvent, RequestStatus } from "@/lib/types";
import { isUuid } from "@/lib/validation";

// A RouteContext a Next.js beépített típusa: az útvonalból tudja, hogy a params-ban egy publicId van.
// A params Promise (később megérkező érték), ezért kell elé az await.
export async function GET(_request: Request, context: RouteContext<"/api/requests/[publicId]">): Promise<Response> {
  const { publicId } = await context.params;
  if (!isUuid(publicId)) {
    return errorResponse(400, "invalid_id", "Az azonosító nem érvényes UUID.");
  }

  try {
    // 1. Maga a kérés. A belső sorszám (id) csak a következő két lekérdezéshez kell, a válaszba nem kerül bele.
    const requests = await query<{
      id: string;
      status: string;
      created_at: Date;
      problems: string[] | null;
      pdf_available: boolean;
    }>(
      `SELECT id, status, created_at, problems, pdf_key IS NOT NULL AS pdf_available
       FROM requests WHERE public_id = $1::uuid`,
      [publicId],
    );
    if (requests.length === 0) {
      // Az elküldés utáni első pillanatban ez természetes: az n8n még nem írta be a sort.
      return errorResponse(404, "not_found", "Nincs ilyen kérés.");
    }
    const request = requests[0];

    // 2. A lépésnapló, időrendben.
    const events = await query<{ step: string; at: Date }>(
      "SELECT step, at FROM request_events WHERE request_id = $1 ORDER BY id",
      [request.id],
    );

    // 3. Az ajánlat(ok). A priced oszlop a price_quote() teljes kimenete JSON-ként: sorok és összesítő.
    //    A dátumot szövegként kérjük, különben a pg időzónás Date-et csinálna belőle, és elcsúszhatna egy nappal.
    const quotes = await query<{
      number: string;
      term_months: number;
      valid_until: string;
      priced: { vat_pct: number; lines: QuoteLine[]; totals: QuoteTotals };
    }>(
      `SELECT number, term_months, valid_until::text AS valid_until, priced
       FROM quotes WHERE request_id = $1 ORDER BY term_months`,
      [request.id],
    );

    // 4. Összerakjuk a választ. Mezőnként, kézzel: így biztosan csak az megy ki, amit itt felsorolunk.
    const body: RequestStatus = {
      public_id: publicId.toLowerCase(),
      status: request.status,
      created_at: request.created_at.toISOString(),
      events: events.map((event): RequestEvent => ({ step: event.step, at: event.at.toISOString() })),
      quotes: quotes.map(
        (quote): Quote => ({
          number: quote.number,
          term_months: quote.term_months,
          valid_until: quote.valid_until,
          vat_pct: quote.priced.vat_pct,
          lines: quote.priced.lines,
          totals: quote.priced.totals,
        }),
      ),
      problems: request.problems ?? [], // a ?? jelentése: ha a bal oldal null, legyen a jobb oldal
      pdf_available: request.pdf_available,
    };
    // no-store: se a böngésző, se közbenső proxy ne tárolja el, mert fél másodperc múlva már más lehet a válasz.
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Adatbázishiba az állapot lekérdezésénél:", error);
    return errorResponse(503, "database_unavailable", "Az adatbázis most nem érhető el.");
  }
}
