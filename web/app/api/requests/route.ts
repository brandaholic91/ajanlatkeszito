// POST /api/requests: új ajánlatkérés.
// A Next.js-ben a mappa adja az URL-t (app/api/requests), a fájlban exportált függvény neve pedig a HTTP-metódust.
import { dailyRequestLimit, n8nBaseUrl } from "@/lib/config";
import { query } from "@/lib/db";
import { errorResponse, postToN8n } from "@/lib/http";
import { validateNewRequest } from "@/lib/validation";

// Az "async" függvényben lehet "await"-et írni: megvárja a lassú műveletet (adatbázis, hálózat),
// de közben a szerver más kéréseket is kiszolgál. Ugyanaz, mint Pythonban az async def / await.
export async function POST(request: Request): Promise<Response> {
  // 1. A törzs beolvasása. Ha nem érvényes JSON, a request.json() kivételt dob.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_input", "A kérés törzse nem érvényes JSON.");
  }

  // 2. Ellenőrzés: UUID, szöveghossz, e-mail.
  const validation = validateNewRequest(body);
  if (!validation.ok) {
    return errorResponse(400, "invalid_input", validation.message);
  }
  const newRequest = validation.value;

  // 3. Napi keret, az adatbázisból számolva. Egy lekérdezés adja meg azt is, hogy foglalt-e már az azonosító.
  let counts: { today: number; same_id: number };
  try {
    const rows = await query<{ today: number; same_id: number }>(
      `SELECT
         (SELECT count(*)::int FROM requests WHERE created_at >= date_trunc('day', now())) AS today,
         (SELECT count(*)::int FROM requests WHERE public_id = $1::uuid) AS same_id`,
      [newRequest.public_id],
    );
    counts = rows[0];
  } catch (error) {
    console.error("Adatbázishiba az új kérésnél:", error);
    return errorResponse(503, "database_unavailable", "Az adatbázis most nem érhető el. Próbáld újra kicsit később.");
  }
  if (counts.same_id > 0) {
    return errorResponse(409, "duplicate", "Ezzel az azonosítóval már érkezett kérés.");
  }
  if (counts.today >= dailyRequestLimit()) {
    return errorResponse(429, "daily_limit", "A demó mai kerete elfogyott. Holnap újra kipróbálható.");
  }

  // 4. Továbbítás az n8n-nek. A válasz csak akkor jön meg, amikor a workflow végigfutott (modell, ellenőrzés, árazás).
  //    Az oldal ezt nem várja meg: a saját public_id-jával közben már kérdezgeti az állapotot.
  let n8nResponse: Response;
  try {
    n8nResponse = await postToN8n(`${n8nBaseUrl()}/webhook/ajanlatkeres`, newRequest);
  } catch (error) {
    console.error("Az n8n nem érhető el:", error);
    return errorResponse(502, "workflow_unavailable", "A feldolgozó (n8n) most nem érhető el. Próbáld újra kicsit később.");
  }
  if (!n8nResponse.ok) {
    console.error("Az n8n hibát adott a feldolgozásnál:", n8nResponse.status);
    return errorResponse(502, "workflow_failed", "A feldolgozás közben hiba történt. Próbáld újra.");
  }

  // 5. Az n8n válaszában benne van a belső sorszám (request_id) is; abból csak az állapotot adjuk tovább.
  const result = (await n8nResponse.json()) as { status?: string };
  return Response.json({ public_id: newRequest.public_id, status: result.status }, { status: 201 });
}
