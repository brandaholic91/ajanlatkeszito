// Közös típusok: ugyanezeket használja a szerver (route handlerek) és a böngésző (komponensek).
// A TypeScript típus olyan, mint Pythonban a TypedDict: csak leírja, milyen mezői vannak egy objektumnak.
// Futás közben nem létezik, a fordító ellenőrzi vele a kódot.

// Egy sor a lépésnaplóból (request_events tábla).
export type RequestEvent = {
  step: string; // received | extracted | checked | priced | needs_clarification | approved | pdf_stored | sent | email_skipped
  at: string; // időpont ISO formában, pl. "2026-10-06T10:47:08.353Z"
};

// Egy tételsor az ajánlatban. A mezők a price_quote() SQL-függvény kimenetéből jönnek (db/02_pricing.sql).
export type QuoteLine = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  discount_pct: number;
  monthly_list: number; // listaár, havi
  monthly_unit: number; // kedvezményes egységár, havi
  monthly_total: number;
  one_time_list: number;
  one_time_unit: number;
  one_time_total: number;
};

// Az ajánlat összesítője, szintén a price_quote() kimenetéből. Minden összeg forint.
export type QuoteTotals = {
  one_time_net: number;
  one_time_vat: number;
  one_time_gross: number;
  monthly_net: number;
  monthly_vat: number;
  monthly_gross: number;
  contract_net: number; // teljes szerződéses érték: egyszeri + havi × hűségidő
  contract_gross: number;
  discount_net: number; // ennyit spórol a mennyiségi kedvezménnyel a teljes időszakra
};

// Egy ajánlatváltozat. Ha a kérésben nem volt hűségidő, kettő készül: 12 és 24 hónapra.
export type Quote = {
  number: string; // pl. "AJ-2026-0001"
  term_months: number; // 12 vagy 24
  valid_until: string; // "2026-10-21"
  vat_pct: number;
  lines: QuoteLine[];
  totals: QuoteTotals;
};

// Ezt adja vissza a GET /api/requests/[publicId].
// A belső sorszám (requests.id) szándékosan nincs benne: kifelé csak a public_id azonosít.
export type RequestStatus = {
  public_id: string;
  status: string; // received | priced | needs_clarification | approved | sent
  created_at: string;
  events: RequestEvent[];
  quotes: Quote[]; // üres, amíg nincs árazva (és a visszakérdezés ágán is)
  problems: string[]; // az ellenőrzés találatai; csak a visszakérdezés ágán nem üres
  pdf_available: boolean; // igaz, ha a PDF már bent van az objektumtárolóban
};

// Hiba esetén minden végpont ilyen JSON-t ad vissza a megfelelő HTTP-státuszkóddal.
export type ApiErrorBody = {
  error: string; // gépnek szóló kód, pl. "daily_limit"
  message: string; // embernek szóló magyar szöveg, ezt írja ki az oldal
};
