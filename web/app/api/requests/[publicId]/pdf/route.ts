// GET /api/requests/[publicId]/pdf: a tárolt PDF letöltése.
// Nem készít új PDF-et: azt a fájlt adja vissza, ami a jóváhagyáskor a tárolóba került (és levélben kiment).
import { query } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { getPdfObject } from "@/lib/s3";
import { isUuid } from "@/lib/validation";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/requests/[publicId]/pdf">,
): Promise<Response> {
  const { publicId } = await context.params;
  if (!isUuid(publicId)) {
    return errorResponse(400, "invalid_id", "Az azonosító nem érvényes UUID.");
  }

  // 1. A fájl helye az adatbázisból jön. A böngésző csak a public_id-t adja meg, fájlnevet soha.
  let pdfKey: string | null;
  try {
    const rows = await query<{ pdf_key: string | null }>(
      "SELECT pdf_key FROM requests WHERE public_id = $1::uuid",
      [publicId],
    );
    // A ?. jelentése: ha nincs ilyen sor (rows[0] undefined), ne dobjon hibát, hanem legyen az eredmény undefined.
    pdfKey = rows[0]?.pdf_key ?? null;
  } catch (error) {
    console.error("Adatbázishiba a PDF keresésénél:", error);
    return errorResponse(503, "database_unavailable", "Az adatbázis most nem érhető el.");
  }
  if (pdfKey === null) {
    return errorResponse(404, "not_found", "Ehhez a kéréshez nincs tárolt PDF.");
  }

  // 2. A fájl lekérése a tárolóból.
  try {
    const object = await getPdfObject(pdfKey);
    if (!object.Body) {
      return errorResponse(502, "storage_failed", "A PDF-et nem sikerült letölteni a tárolóból.");
    }
    const headers = new Headers({
      "Content-Type": "application/pdf",
      // attachment: a böngésző letöltse, ne megnyissa; a fájlnév az ajánlat sorszáma (pl. AJ-2026-0001.pdf)
      "Content-Disposition": `attachment; filename="${pdfKey}"`,
      "Cache-Control": "no-store",
    });
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", String(object.ContentLength));
    }
    // 3. Folyamként (stream) adjuk tovább: a bájtok úgy mennek a böngészőnek, ahogy a tárolóból érkeznek,
    //    a szervernek nem kell az egész fájlt a memóriában tartania.
    return new Response(object.Body.transformToWebStream(), { headers });
  } catch (error) {
    console.error("Hiba a PDF letöltésénél a tárolóból:", error);
    return errorResponse(502, "storage_failed", "A PDF-et nem sikerült letölteni a tárolóból.");
  }
}
