// Az adatkezelési tájékoztató (az app/adatkezeles/page.tsx az "/adatkezeles" címet szolgálja ki).
// Csak szöveg, működés nincs benne. Ha a rendszer adatkezelése változik (megőrzési idő, új külső szolgáltató),
// ezt a szöveget is át kell írni: a 14 nap az Utánkövetés workflow delete_after_days beállításából jön.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Adatkezelési tájékoztató – Ajánlatkészítő demó",
};

const CONTACT_EMAIL = "holikbalazs@gmail.com";

// Egy szakasz kinézete: fölötte hajszálvonal, mint a főoldal megjegyzéseinél.
const SECTION = "flex flex-col gap-2 border-t border-line pt-5";
const HEADING = "text-xl font-semibold";
const LIST = "flex list-disc flex-col gap-1.5 pl-5";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-10">
        <div className="flex max-w-[68ch] flex-col gap-2">
          <p>
            <Link className="button-text" href="/">
              ← Vissza a demóhoz
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Adatkezelési tájékoztató</h1>
          <p className="text-muted">
            Ez az oldal egy portfólió-demó. Röviden: a kérésed szövegét és az e-mail-címedet 14 napig tárolom, utána
            magától törlődik. Hirdetésre, hírlevélre vagy más célra nem használom.
          </p>
        </div>

        <div className="flex max-w-[68ch] flex-col gap-6">
          <section className={SECTION}>
            <h2 className={HEADING}>Ki kezeli az adatokat</h2>
            <p>
              Holik Balázs, magánszemélyként. Elérhetőség:{" "}
              <a className="font-medium text-brand underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>

          <section className={SECTION}>
            <h2 className={HEADING}>Milyen adatot kezel a demó</h2>
            <ul className={LIST}>
              <li>Az e-mail-címet, amelyet az űrlapon megadsz.</li>
              <li>A kérés szövegét, amelyet beírsz.</li>
              <li>Az ebből készült ajánlatot, PDF-ben is.</li>
              <li>A folyamat lépéseinek időpontját (ezt látod a lépésnaplóban).</li>
            </ul>
            <p>Az oldal nem használ sütit, és nincs rajta látogatottságmérő.</p>
          </section>

          <section className={SECTION}>
            <h2 className={HEADING}>Mire használom</h2>
            <ul className={LIST}>
              <li>Arra, hogy az ajánlat elkészüljön, és e-mailben megkapd.</li>
              <li>Arra, hogy az ajánlat után egy emlékeztető e-mail is menjen, amely a folyamat része.</li>
            </ul>
            <p>
              Az adatkezelés alapja a hozzájárulásod: azzal adod meg, hogy beküldöd az űrlapot. Egy kérésre legfeljebb
              két levelet kapsz, többet nem.
            </p>
          </section>

          <section className={SECTION}>
            <h2 className={HEADING}>Kihez kerül az adat</h2>
            <ul className={LIST}>
              <li>
                <strong>Nyelvi modell (DeepSeek, az opencode szolgáltatásán keresztül):</strong> csak a kérés szövegét
                kapja meg. Az e-mail-címed nem kerül a modell elé.
              </li>
              <li>
                <strong>Levélküldő (Resend):</strong> az e-mail-címedet, a levél szövegét és a csatolt PDF-et kapja meg.
              </li>
              <li>
                <strong>Tárolás:</strong> az adatbázis és a PDF-ek saját üzemeltetésű szerveren vannak.
              </li>
            </ul>
            <p>
              A két külső szolgáltató az adatot a saját szabályai szerint kezeli, és az Európai Unión kívül is
              feldolgozhatja. Ezért kérem az űrlapon, hogy a kérés szövegébe ne írj valódi személyes vagy céges adatot.
            </p>
          </section>

          <section className={SECTION}>
            <h2 className={HEADING}>Meddig őrzöm</h2>
            <ul className={LIST}>
              <li>A kérés, az ajánlat és a tárolt PDF a beküldés után 14 nappal automatikusan törlődik.</li>
              <li>A folyamatot vezérlő rendszer futásnaplói legfeljebb 14 napig maradnak meg.</li>
              <li>A neked kiküldött levelek a saját postafiókodban maradnak, azokat nem tudom törölni.</li>
            </ul>
          </section>

          <section className={SECTION}>
            <h2 className={HEADING}>Mit kérhetsz</h2>
            <p>
              Bármikor kérheted, hogy megmutassam, milyen adatot tárolok rólad, vagy hogy a 14 nap letelte előtt
              töröljem. Ehhez írj a fenti e-mail-címre arról a címről, amelyet az űrlapon megadtál.
            </p>
            <p>
              Ha úgy látod, hogy az adataidat nem megfelelően kezelem, panaszt tehetsz a Nemzeti Adatvédelmi és
              Információszabadság Hatóságnál (naih.hu).
            </p>
          </section>

          <p className="text-sm text-muted">Utoljára frissítve: 2026. október 6.</p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
