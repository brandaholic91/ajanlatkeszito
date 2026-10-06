// A főoldal (az app/page.tsx a "/" címet szolgálja ki). Csak a keretet adja; a működés a Demo komponensben van.
import { Demo } from "@/components/Demo";
import { Notes } from "@/components/Notes";

export default function Home() {
  return (
    <>
      {/* Fejléc: ugyanaz a jel, cégnév és kék vonal, mint a letölthető PDF-ajánlat tetején. */}
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

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-8 pb-16 sm:px-6 lg:gap-12 lg:px-8 lg:pt-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Ajánlatkészítő</h1>
          <p className="max-w-[68ch] text-muted">
            Írd le szabad szöveggel, mire kérsz ajánlatot. A rendszer kiolvassa a tételeket, az adatbázisból kiszámolja
            az árakat, és a jóváhagyásod után PDF-ajánlatot készít.
          </p>
        </div>
        <Demo />
        <Notes />
      </main>
    </>
  );
}
