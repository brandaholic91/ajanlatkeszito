"use client"; // a böngészőben fut: megjegyzi, melyik változat tételei látszanak

// Az elkészült ajánlat. Ha két változat készült (12 és 24 hónap), a fő számok egymás mellett állnak,
// a részletes tételtábla pedig egy kapcsolóval váltható a kettő között. Két hétoszlopos táblázat
// egymás mellett laptopon sem férne el olvashatóan.
import { useState } from "react";
import { formatForint } from "@/lib/format";
import type { Quote } from "@/lib/types";
import { QuoteView } from "./QuoteView";

// A kapcsoló két gombjának kinézete: a kiválasztott sötét, a másik világos.
const SWITCH_ON = "min-h-11 rounded px-4 text-sm font-semibold bg-ink text-white";
const SWITCH_OFF = "min-h-11 rounded px-4 text-sm font-semibold text-ink hover:bg-soft";

export function QuoteSection({ quotes }: { quotes: Quote[] }) {
  // Hányadik változat tételei látszanak. Csak a megjelenítést érinti: jóváhagyáskor mindkét változat megy.
  const [selected, setSelected] = useState(0);
  const quote = quotes[selected] ?? quotes[0];

  return (
    <section aria-labelledby="quote-heading" className="flex flex-col gap-6 border-t-2 border-brand pt-8">
      <div className="flex flex-col gap-1">
        <h2 id="quote-heading" className="text-xl font-semibold">
          Az elkészült ajánlat
        </h2>
        <p className="text-sm text-muted">
          Minden összeg úgy jelenik meg, ahogy az adatbázis kiszámolta. Az összegek forintban értendők.
        </p>
      </div>

      {quotes.length > 1 && (
        <div className="flex flex-col gap-4">
          <p className="max-w-[65ch]">A kérésben nem volt hűségidő, ezért két változat készült: 12 és 24 hónapra.</p>

          {/* A változatok fő számai egymás mellett: soronként egy összeg, oszloponként egy változat. */}
          <table className="w-full max-w-2xl border-collapse text-sm">
            <caption className="sr-only">A változatok egymás mellett, nettó összegekkel</caption>
            <thead>
              <tr>
                <th className="col-head">Nettó</th>
                {quotes.map((variant) => (
                  <th key={variant.number} scope="col" className="col-head num">
                    {variant.term_months} hónap
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="cell text-left font-normal">
                  Egyszeri költség
                </th>
                {quotes.map((variant) => (
                  <td key={variant.number} className="cell num">
                    {formatForint(variant.totals.one_time_net)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="cell text-left font-normal">
                  Havi költség
                </th>
                {quotes.map((variant) => (
                  <td key={variant.number} className="cell num">
                    {formatForint(variant.totals.monthly_net)}
                  </td>
                ))}
              </tr>
              <tr className="border-t-2 border-ink font-bold">
                <th scope="row" className="px-2 pt-2.5 text-left">
                  Teljes szerződéses érték
                </th>
                {quotes.map((variant) => (
                  <td key={variant.number} className="num px-2 pt-2.5 align-top">
                    {formatForint(variant.totals.contract_net)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* A kapcsoló. aria-pressed: a képernyőolvasó is megmondja, melyik gomb van benyomva. */}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span id="variant-switch-label" className="text-sm font-semibold">
              Tételek részletesen:
            </span>
            <div
              role="group"
              aria-labelledby="variant-switch-label"
              className="inline-flex gap-0.5 rounded-md border border-control p-0.5"
            >
              {quotes.map((variant, index) => (
                <button
                  key={variant.number}
                  type="button"
                  aria-pressed={index === selected}
                  className={index === selected ? SWITCH_ON : SWITCH_OFF}
                  onClick={() => setSelected(index)}
                >
                  {variant.term_months} hónap
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <QuoteView quote={quote} />
    </section>
  );
}
