// A lépésnapló lépéseinek magyar neve, és néhány kérdés, amit a napló alapján lehet megválaszolni.
// Tiszta függvények, megjelenítés nélkül: a komponensek ezeket hívják.
import type { RequestEvent } from "./types";

// A lépés neve az adatbázisban -> amit az oldal kiír, ha a lépés elkészült.
// A Record<string, string> ugyanaz, mint Pythonban a dict[str, str].
export const STEP_LABELS: Record<string, string> = {
  received: "A kérés beérkezett",
  extracted: "A nyelvi modell kiolvasta a tételeket",
  checked: "Az ellenőrzés lefutott",
  priced: "Az adatbázis kiszámolta az árakat",
  needs_clarification: "Visszakérdezés kell, ajánlat nem készült",
  approved: "Jóváhagyva",
  pdf_stored: "A PDF elkészült és bekerült a tárolóba",
  sent: "Az e-mail elment",
  email_skipped: "Az e-mail kimaradt, mert betelt a napi levélkeret",
};

// Az utolsó elkészült lépés -> min dolgozik éppen a rendszer. Ezt írja ki az oldal a lista alján, amíg vár.
export const NEXT_STEP_LABELS: Record<string, string> = {
  received: "A nyelvi modell olvassa a kérést…",
  extracted: "Ellenőrzés…",
  checked: "Árazás…",
  approved: "A PDF készül…",
  pdf_stored: "Az e-mail küldése…",
};

// Ha még egyetlen lépés sincs a naplóban.
export const WAITING_FOR_FIRST_STEP = "A kérés úton van a feldolgozóhoz…";

// Ezeknél a lépéseknél a folyamat megáll, és nem történik semmi, amíg a néző nem lép.
const RESTING_STEPS = ["priced", "needs_clarification", "sent", "email_skipped"];

export function stepLabel(step: string): string {
  // Ismeretlen lépésnél (ha később új kerül a naplóba) a nyers név is jobb, mint a semmi.
  return STEP_LABELS[step] ?? step;
}

// Igaz, ha a napló utolsó lépése után még várunk valamire (tehát érdemes tovább kérdezgetni).
export function isInProgress(events: RequestEvent[]): boolean {
  if (events.length === 0) {
    return true;
  }
  const lastStep = events[events.length - 1].step;
  return !RESTING_STEPS.includes(lastStep);
}

// A napló két szakasza: a feldolgozás (az "approved" előtti lépések) és a jóváhagyás (az "approved"-tól).
// Azért kell szétvágni, mert a kettő között a néző gondolkodik: az az idő nem a rendszeré.
export function splitEvents(events: RequestEvent[]): { processing: RequestEvent[]; approval: RequestEvent[] } {
  const approvedIndex = events.findIndex((event) => event.step === "approved");
  if (approvedIndex === -1) {
    return { processing: events, approval: [] };
  }
  return { processing: events.slice(0, approvedIndex), approval: events.slice(approvedIndex) };
}

// Mi lett a levéllel? A napló mondja meg: "sent" = elment, "email_skipped" = kimaradt, egyik sem = még nem tudjuk.
export function emailOutcome(events: RequestEvent[]): "sent" | "skipped" | null {
  if (events.some((event) => event.step === "sent")) {
    return "sent";
  }
  if (events.some((event) => event.step === "email_skipped")) {
    return "skipped";
  }
  return null;
}
