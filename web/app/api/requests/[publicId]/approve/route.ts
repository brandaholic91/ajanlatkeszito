// POST /api/requests/[publicId]/approve: a „Mehet” gomb. Továbbadja a jóváhagyást az n8n második workflow-jának,
// amely elkészíti és eltárolja a PDF-et, majd (ha a napi levélkeret engedi) elküldi levélben.
import { n8nBaseUrl } from "@/lib/config";
import { errorResponse, postToN8n } from "@/lib/http";
import { isUuid } from "@/lib/validation";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/requests/[publicId]/approve">,
): Promise<Response> {
  const { publicId } = await context.params;
  if (!isUuid(publicId)) {
    return errorResponse(400, "invalid_id", "Az azonosító nem érvényes UUID.");
  }

  let n8nResponse: Response;
  try {
    n8nResponse = await postToN8n(`${n8nBaseUrl()}/webhook/ajanlat-jovahagyas`, { public_id: publicId });
  } catch (error) {
    console.error("Az n8n nem érhető el:", error);
    return errorResponse(502, "workflow_unavailable", "A feldolgozó (n8n) most nem érhető el. Próbáld újra kicsit később.");
  }

  // 409: az adatbázis nem engedte a jóváhagyást (approve_request, db/04_approval.sql). Ezt változatlan kóddal adjuk tovább.
  if (n8nResponse.status === 409) {
    const refusal = (await n8nResponse.json()) as { status?: string };
    if (refusal.status === "not_found") {
      return errorResponse(409, "not_found", "Nincs ilyen kérés.");
    }
    return errorResponse(409, "not_approvable", "Ez a kérés most nem hagyható jóvá (már jóváhagyták, vagy nincs kész ajánlata).");
  }
  if (!n8nResponse.ok) {
    console.error("Az n8n hibát adott a jóváhagyásnál:", n8nResponse.status);
    return errorResponse(502, "workflow_failed", "A PDF készítése vagy a küldés közben hiba történt.");
  }

  // Siker: status = "sent" (elment a levél) vagy "email_skipped" (betelt a napi levélkeret, de a PDF elkészült).
  const result = (await n8nResponse.json()) as { status?: string; number?: string };
  return Response.json({ status: result.status, number: result.number });
}
