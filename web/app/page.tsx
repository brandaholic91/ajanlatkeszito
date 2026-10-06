// A főoldal (az app/page.tsx a "/" címet szolgálja ki). Csak a keretet adja; a működés a Demo komponensben van.
import { Demo } from "@/components/Demo";
import { Notes } from "@/components/Notes";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />

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

      <SiteFooter />
    </>
  );
}
