// A böngésző innen hívja a saját szerverünket. Az oldal csak ezzel a négy végponttal beszél;
// az n8n-t, az adatbázist és a tárolót a szerver éri el a belső hálózaton.
import type { ApiErrorBody, RequestStatus } from "./types";

const NETWORK_ERROR = "A szerver nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra.";

// Hibás válaszból kiolvassa a magyar hibaüzenetet. Ha a válasz nem a mi JSON-unk, általános szöveget ad.
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.message || `Váratlan hiba (${response.status}).`;
  } catch {
    return `Váratlan hiba (${response.status}).`;
  }
}

// A fetch csak akkor dob kivételt, ha a szerver el sem érhető. A 4xx/5xx válasz nála nem hiba,
// ezért a response.ok-t külön nézni kell. Ez a függvény mindkét esetből magyar szövegű Error-t csinál.
async function send(url: string, options?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response;
}

// Új kérés beküldése. Csak akkor tér vissza, amikor a feldolgozás végigfutott.
export async function createRequest(publicId: string, email: string, text: string): Promise<void> {
  await send("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_id: publicId, email, text }),
  });
}

// Egy kérés állapota. null, ha a kérés még nincs az adatbázisban: a beküldés utáni első
// pillanatokban ez természetes, mert az n8n még nem írta be a sort.
export async function fetchStatus(publicId: string): Promise<RequestStatus | null> {
  let response: Response;
  try {
    response = await fetch(`/api/requests/${publicId}`, { cache: "no-store" });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return (await response.json()) as RequestStatus;
}

// Jóváhagyás („Mehet”). Csak akkor tér vissza, amikor a PDF elkészült és a levél sorsa eldőlt.
export async function approveRequest(publicId: string): Promise<void> {
  await send(`/api/requests/${publicId}/approve`, { method: "POST" });
}

// A PDF letöltési címe; sima linkbe kerül.
export function pdfUrl(publicId: string): string {
  return `/api/requests/${publicId}/pdf`;
}
