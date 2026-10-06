// Két apró segédfüggvény a route handlereknek. Csak a szerveren fut.
import type { ApiErrorBody } from "./types";

// Egységes hibaválasz: minden végpont ugyanilyen alakú JSON-t ad hibánál.
export function errorResponse(status: number, error: string, message: string): Response {
  const body: ApiErrorBody = { error, message };
  return Response.json(body, { status });
}

// Meddig várunk az n8n-re. A jóváhagyásban benne van a PDF elkészítése is, az pár másodperc.
const N8N_TIMEOUT_MS = 60_000;

// JSON küldése egy n8n webhooknak. Ha az n8n nem érhető el vagy nem válaszol időben, a fetch kivételt dob:
// ezt a hívó try/catch-csel kapja el.
export async function postToN8n(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
  });
}
