// A lábléc: ki készítette, hol olvasható az adatkezelési tájékoztató, és hol van a forráskód.
// A linket továbbküldik, ezért a készítő nevének az oldalon is rajta kell lennie.
// Külön komponens, mert a főoldal és az adatkezelési tájékoztató is ezt használja.
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          Készítette: <strong className="font-bold text-ink">Holik Balázs</strong>
        </p>
        <p className="flex flex-wrap gap-x-6">
          {/* A Link a Next.js saját linkje: oldalak között teljes újratöltés nélkül vált. */}
          <Link className="button-text" href="/adatkezeles">
            Adatkezelési tájékoztató
          </Link>
          {/* A rel="noopener noreferrer" miatt az új lapon megnyíló oldal nem fér hozzá ehhez a laphoz. */}
          <a
            className="button-text"
            href="https://github.com/brandaholic91/ajanlatkeszito"
            target="_blank"
            rel="noopener noreferrer"
          >
            Forráskód (GitHub)
          </a>
          <a
            className="button-text"
            href="https://www.linkedin.com/in/holikbalazs/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
        </p>
      </div>
    </footer>
  );
}
