// Egy ajánlatváltozat: a tételsorok táblázata és az összesítő, a PDF-ajánlat táblázatának mintájára.
// Itt semmi nem számolódik: minden összeg úgy jelenik meg, ahogy az adatbázis kiszámolta.
//
// Hány oszlop látszik, az a képernyő szélességétől függ (a Tailwind "sm:" és "lg:" előtagjai ezt jelentik):
//   - telefonon (640 képpont alatt) három: Tétel, Havidíj, Egyszeri díj. A mennyiség és a kedvezmény
//     a tétel neve alá kerül kis betűvel, az egységárak nem látszanak (a PDF-ben ott vannak).
//   - közepes szélességen (sm: 640-től) öt: külön oszlopot kap a mennyiség és a kedvezmény.
//   - széles képernyőn (lg: 1024-től) mind a hét, pontosan úgy, mint a PDF-ben.
import type { ReactNode } from "react";
import { formatForint } from "@/lib/format";
import type { Quote, QuoteLine } from "@/lib/types";

// A kategóriák kiírt neve. Ugyanaz a lista, mint a PDF-készítőben (pdf-service/main.py, CATEGORY_NAMES).
const CATEGORY_LABELS: Record<string, string> = {
  mobil: "Mobil",
  internet: "Internet",
  eszkoz: "Eszközök",
  felho: "Felhő",
  uzemeltetes: "Üzemeltetés",
};

// Ha nincs összeg (nulla), gondolatjel áll a helyén, halványan.
const DASH = <span className="text-muted">–</span>;

// "−10%" vagy üres szöveg. A mínuszjel valódi mínusz (U+2212), mint a PDF-ben.
function discountText(line: QuoteLine): string {
  return line.discount_pct > 0 ? `−${line.discount_pct}%` : "";
}

// Egységár-cella: ha van kedvezmény, előtte áthúzva a listaár.
function UnitPrice({ list, unit }: { list: number; unit: number }) {
  if (unit === 0) {
    return DASH;
  }
  return (
    <>
      {list !== unit && <s className="mr-1.5 text-xs text-muted">{formatForint(list)}</s>}
      {formatForint(unit)}
    </>
  );
}

// Egy tételsor.
function LineRow({ line }: { line: QuoteLine }) {
  const discount = discountText(line);
  return (
    <tr>
      <td className="cell break-words">
        {line.name}
        {/* Csak telefonon látszik (sm:hidden = 640 képponttól eltűnik): mennyiség és kedvezmény a név alatt. */}
        <span className="num block text-left text-xs text-muted sm:hidden">
          {line.qty} {line.unit}
          {discount !== "" && ` · ${discount}`}
        </span>
      </td>
      <td className="cell num hidden sm:table-cell">
        {line.qty} {line.unit}
      </td>
      <td className="cell num hidden sm:table-cell">{discount !== "" ? discount : DASH}</td>
      <td className="cell num hidden lg:table-cell">
        <UnitPrice list={line.monthly_list} unit={line.monthly_unit} />
      </td>
      <td className="cell num">{line.monthly_total > 0 ? formatForint(line.monthly_total) : DASH}</td>
      <td className="cell num hidden lg:table-cell">
        <UnitPrice list={line.one_time_list} unit={line.one_time_unit} />
      </td>
      <td className="cell num">{line.one_time_total > 0 ? formatForint(line.one_time_total) : DASH}</td>
    </tr>
  );
}

export function QuoteView({ quote }: { quote: Quote }) {
  const totals = quote.totals;

  // A táblázat sorai: a tételek, és minden új kategória előtt egy kategóriasor.
  // A tételek az adatbázisból már kategória szerint rendezve jönnek, itt csak a váltást figyeljük.
  const rows: ReactNode[] = [];
  let previousCategory = "";
  for (const line of quote.lines) {
    if (line.category !== previousCategory) {
      rows.push(
        <tr key={`category-${line.category}`}>
          {/* colSpan={7}: ez a cella a táblázat teljes szélességét átéri. */}
          <th
            colSpan={7}
            scope="colgroup"
            className="border-b border-line bg-soft px-2 py-1.5 text-left text-xs font-bold tracking-[0.04em] uppercase"
          >
            {CATEGORY_LABELS[line.category] ?? line.category}
          </th>
        </tr>,
      );
      previousCategory = line.category;
    }
    rows.push(<LineRow key={line.sku} line={line} />);
  }

  return (
    <article className="flex flex-col gap-4">
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num text-lg font-semibold">{quote.number}</span>
        <span className="text-sm font-normal text-muted">
          {quote.term_months} hónap hűségidő · érvényes: {quote.valid_until}
        </span>
      </h3>

      {/* Ha valami mégsem férne ki, a táblázat a saját keretén belül görgethető oldalra, nem az egész oldal. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="col-head">Tétel</th>
              <th className="col-head num hidden sm:table-cell">Menny.</th>
              <th className="col-head num hidden sm:table-cell">Kedv.</th>
              <th className="col-head num hidden lg:table-cell">Havidíj / egység</th>
              <th className="col-head num">Havidíj</th>
              <th className="col-head num hidden lg:table-cell">Egyszeri / egység</th>
              <th className="col-head num">Egyszeri díj</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      {/* Az összesítő jobbra zárva áll, mint a PDF-ben; a fő sor fölött vastag vonal. */}
      <div className="flex flex-col gap-3 lg:ml-auto lg:w-3/5">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <td className="col-head" />
              <th className="col-head num">Nettó</th>
              <th className="col-head num">Bruttó ({quote.vat_pct}% áfával)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="cell text-left font-normal">
                Egyszeri költség
              </th>
              <td className="cell num">{formatForint(totals.one_time_net)}</td>
              <td className="cell num">{formatForint(totals.one_time_gross)}</td>
            </tr>
            <tr>
              <th scope="row" className="cell text-left font-normal">
                Havi költség
              </th>
              <td className="cell num">{formatForint(totals.monthly_net)}</td>
              <td className="cell num">{formatForint(totals.monthly_gross)}</td>
            </tr>
            <tr className="border-t-2 border-ink font-bold sm:text-base">
              <th scope="row" className="px-2 pt-3 text-left">
                Teljes szerződéses érték ({quote.term_months} hónap)
              </th>
              <td className="num px-2 pt-3 align-top">{formatForint(totals.contract_net)}</td>
              <td className="num px-2 pt-3 align-top">{formatForint(totals.contract_gross)}</td>
            </tr>
          </tbody>
        </table>

        {totals.discount_net > 0 && (
          <p className="px-2 text-sm font-semibold text-brand lg:text-right">
            A mennyiségi kedvezménnyel {formatForint(totals.discount_net)} megtakarítás a teljes időszakra (nettó).
          </p>
        )}
      </div>
    </article>
  );
}
