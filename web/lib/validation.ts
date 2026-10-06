// A bemenet ellenőrzése. A szerver ebben nem bízhat a böngészőre: az űrlap szabályait bárki megkerülheti.

export const MAX_TEXT_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 254;

// UUID alakja: 8-4-4-4-12 hexadecimális karakter, kötőjelekkel.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Szándékosan laza: valami@valami.valami, szóköz nélkül. Hogy a cím létezik-e, azt úgysem lehet mintával eldönteni.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A visszatérési típus "value is string": ha a függvény igazat ad, a TypeScript onnantól szövegként kezeli az értéket.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export type NewRequest = {
  public_id: string;
  email: string;
  text: string;
};

// Az eredmény kétféle lehet: vagy rendben van (és benne a megtisztított adat), vagy nem (és benne a hibaüzenet).
// Az "ok" mezőből a TypeScript tudja, melyik eset áll fenn.
export type ValidationResult =
  | { ok: true; value: NewRequest }
  | { ok: false; message: string };

// A body "unknown" típusú, mert bármi jöhet a hálózatról: előbb ellenőrizni kell, csak utána használni.
export function validateNewRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "A kérés törzse nem JSON-objektum." };
  }
  // Innentől tudjuk, hogy objektum; a mezőit egyenként ellenőrizzük.
  const { public_id, email, text } = body as Record<string, unknown>;

  if (!isUuid(public_id)) {
    return { ok: false, message: "Az azonosító (public_id) nem érvényes UUID." };
  }
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, message: "Írd be az ajánlatkérés szövegét." };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, message: `A kérés legfeljebb ${MAX_TEXT_LENGTH} karakter lehet.` };
  }
  if (typeof email !== "string" || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email.trim())) {
    return { ok: false, message: "Adj meg egy érvényes e-mail-címet." };
  }

  return {
    ok: true,
    value: { public_id: public_id.toLowerCase(), email: email.trim(), text: text.trim() },
  };
}
