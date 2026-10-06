// Állandó megjegyzések az oldal alján: mit érdemes tudni a demóról.

// ===== KAPCSOLÓ =====
// Az emlékeztető workflow (ha az ügyfél nem válaszol az ajánlatra) MÉG NINCS megépítve.
// Amíg ez hamis, az oldal tervként beszél róla. Ha elkészült, írd át igazra: akkor tényként írja ki.
const REMINDER_WORKFLOW_BUILT = false;

// Egy megjegyzés kinézete: fölötte hajszálvonal, mint a táblázat soraiban.
const NOTE = "border-t border-line pt-3";

export function Notes() {
  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
      <h2 id="notes-heading" className="text-xl font-semibold">
        Amit a demóról tudni érdemes
      </h2>
      {/* Széles képernyőn két oszlop, keskenyen egy. */}
      <ul className="grid gap-x-12 gap-y-3 text-sm md:grid-cols-2">
        <li className={NOTE}>
          Az árat mindig adatbázis-lekérdezés számolja ki. A nyelvi modell csak a tételeket és a mennyiségeket olvassa
          ki a szövegből; árat nem lát, így kitalálni sem tud.
        </li>
        <li className={NOTE}>Mérés: 20 előkészített tesztkérésből 19-re adott helyes ajánlatot a rendszer.</li>
        {/* A ? : páros a JSX-ben az if-else: ha a feltétel igaz, az első ág rajzolódik ki, különben a második. */}
        {REMINDER_WORKFLOW_BUILT ? (
          <li className={NOTE}>
            Ha az ajánlatra nem jön válasz, emlékeztető megy. Itt, a demóban 2 perc után; élesben 3 nap után menne.
          </li>
        ) : (
          <li className={NOTE}>
            Tervezett következő lépés (még nincs megépítve): emlékeztető, ha az ajánlatra nem jön válasz. A demóban 2
            perc után menne, élesben 3 nap után.
          </li>
        )}
        <li className={NOTE}>A Kéktorony Telekom kitalált cég, kitalált árakkal. Ez nem valós ajánlat.</li>
      </ul>
    </section>
  );
}
