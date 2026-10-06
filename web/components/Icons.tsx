// Az oldal apró jelei, SVG-ként megrajzolva (nem képfájlok és nem betűjelek).
// Mindegyik aria-hidden: a képernyőolvasó átugorja őket, mert mellettük mindig ott a szöveg.
// A "currentColor" azt jelenti: a jel olyan színű, mint a körülötte lévő szöveg.

// Kész lépés: kitöltött kör, benne pipa.
export function DoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Folyamatban: forgó körív. A forgást a globals.css "spinner" osztálya adja.
export function SpinnerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="spinner h-5 w-5 shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M10 2a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Még hátralévő lépés: üres kör.
export function UpcomingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Figyelmeztetés (hibaüzenet, visszakérdezés): kör, benne felkiáltójel.
export function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 5.8v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="13.9" r="1.1" fill="currentColor" />
    </svg>
  );
}

// Letöltés: lefelé mutató nyíl egy tálca fölött.
export function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0">
      <path
        d="M10 3.5v9m0 0l-3.5-3.5M10 12.5l3.5-3.5M4 16.5h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
