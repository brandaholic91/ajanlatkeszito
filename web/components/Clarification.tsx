// A visszakérdezés ága: az ellenőrzés hibát talált, ezért ajánlat nem készült.
// A lista az adatbázis check_request() függvényének találatait mutatja, változtatás nélkül.
import { AlertIcon } from "./Icons";

export function Clarification({ problems }: { problems: string[] }) {
  return (
    <section
      aria-labelledby="clarification-heading"
      className="flex gap-3 rounded-lg border border-notice-line bg-notice-soft p-5 sm:p-6"
    >
      <span className="mt-1 text-notice">
        <AlertIcon />
      </span>
      <div className="flex flex-col gap-3">
        <h2 id="clarification-heading" className="text-xl font-semibold">
          Ebből a kérésből nem készült ajánlat
        </h2>
        <div>
          <p>Az ellenőrzés ezeket találta:</p>
          <ul className="mt-1 list-disc pl-5 font-medium">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
        <p className="max-w-[65ch]">
          A rendszer ilyenkor nem találgat árat. Pontosítsd a kérést, és küldd be újra.
        </p>
      </div>
    </section>
  );
}
