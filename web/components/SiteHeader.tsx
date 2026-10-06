// A fejléc: ugyanaz a jel, cégnév és kék vonal, mint a letölthető PDF-ajánlat tetején.
// Külön komponens, mert a főoldal és az adatkezelési tájékoztató is ezt használja.

export function SiteHeader() {
  return (
    <header className="border-b-2 border-brand">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-lg font-bold text-white"
          >
            K
          </div>
          <div>
            <p className="leading-tight font-bold whitespace-nowrap">Kéktorony Telekom</p>
            {/* A szlogen telefonon nem fér ki egy sorba, ott elmarad. */}
            <p className="hidden text-xs text-muted sm:block">Üzleti telekom- és IT-szolgáltatás</p>
          </div>
        </div>
        <p className="text-right text-xs text-muted">
          <strong className="block text-sm font-bold text-ink">Demó</strong>
          Kitalált cég, kitalált árak
        </p>
      </div>
    </header>
  );
}
