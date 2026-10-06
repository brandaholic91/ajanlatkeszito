// Állandó megjegyzések az oldal alján: mit érdemes tudni a demóról.

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
        <li className={NOTE}>
          A kiküldött ajánlat után emlékeztető e-mail is megy. Éles működésnél 72 óra után menne, és csak akkor, ha
          nem jött válasz; itt 2 perc után megy mindenkinek, hogy a folyamat látható legyen.
        </li>
        <li className={NOTE}>A Kéktorony Telekom kitalált cég, kitalált árakkal. Ez nem valós ajánlat.</li>
      </ul>
    </section>
  );
}
