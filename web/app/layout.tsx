// A minden oldalra érvényes keret: a <html> és a <body>. A Next.js ebbe illeszti be az oldal tartalmát (children).
import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

// A betűtípus: Noto Sans, ugyanaz, amivel a PDF-ajánlat készül.
// A next/font a buildkor letölti a betűfájlokat, és a saját szerverünkről szolgálja ki őket:
// a látogató böngészője nem fordul a Google-höz. A "latin-ext" készletben van az ő és az ű.
// A "variable" egy CSS-változó neve; a globals.css ezen keresztül állítja be az oldal betűtípusának.
const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ajánlatkészítő – demó",
  description: "Szabad szöveges ajánlatkérésből PDF-ajánlat. Kitalált cég, kitalált árak.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hu" className={notoSans.variable}>
      <body>{children}</body>
    </html>
  );
}
