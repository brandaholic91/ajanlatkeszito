"use client"; // ez a fájl a böngészőben fut (állapotot és időzítőt használ)

// Saját hook: fél másodpercenként lekérdezi egy kérés állapotát, amíg van mire várni.
// A hook egy "use"-zal kezdődő függvény, amely React-állapotot használ; a komponens úgy hívja, mint bármely függvényt.
import { useEffect, useState } from "react";
import { fetchStatus } from "./api-client";
import { isInProgress } from "./steps";
import type { RequestStatus } from "./types";

const POLL_INTERVAL_MS = 500;

// publicId:     melyik kérést figyeljük (null = még nincs kérés)
// callInFlight: igaz, amíg a beküldő vagy a jóváhagyó hívás úton van; ilyenkor biztosan várunk új lépésre
// stopped:      igaz, ha a hívás hibával ért véget; ilyenkor nem figyelünk tovább, mert egy elakadt kérés
//               állapota már nem fog változni
export function useRequestStatus(publicId: string | null, callInFlight: boolean, stopped: boolean) {
  // useState: olyan változó, amelynek a változására a React újrarajzolja a komponenst.
  // Két dolgot ad vissza: a mostani értéket és a függvényt, amellyel át lehet írni.
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useEffect: a kirajzolás UTÁN fut le, és újra lefut, ha a végén felsorolt értékek
  // (publicId, callInFlight, stopped) bármelyike megváltozik. Ide való minden, ami a képernyőn kívüli
  // világgal beszél: itt a hálózati kérés és az időzítő.
  useEffect(() => {
    if (publicId === null || stopped) {
      return;
    }
    // TypeScript-apróság: a belső függvényben a fordító már nem tudja, hogy a publicId nem null,
    // ezért egy új, biztosan szöveg típusú változóba tesszük.
    const id: string = publicId;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      // Kell-e még egy kör? Amíg a hívás úton van, biztosan. Utána csak akkor, ha a napló szerint
      // a folyamat még nem ért nyugvópontra (pl. a hívás már visszatért, de az utolsó lépést még nem láttuk).
      let again = callInFlight;
      try {
        const next = await fetchStatus(id);
        if (cancelled) {
          return; // közben leállítottak: a megkésett választ eldobjuk
        }
        if (next !== null) {
          setStatus(next);
          if (isInProgress(next.events)) {
            again = true;
          }
        }
        setError(null);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        // Egy sikertelen lekérdezés nem állítja meg a figyelést, amíg a hívás úton van: a következő kör újra próbálkozik.
        setError(caught instanceof Error ? caught.message : "Ismeretlen hiba.");
      }
      if (again) {
        // A következő kört csak akkor időzítjük, amikor az előző válasz megjött.
        // (setInterval-lal lassú hálózaton egymásra torlódnának a kérések.)
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    poll();

    // Takarítás (cleanup): a React ezt a visszaadott függvényt hívja meg, mielőtt az effektet újra futtatná,
    // vagy amikor a komponens eltűnik az oldalról. Enélkül a régi időzítő tovább futna a háttérben.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publicId, callInFlight, stopped]);

  // Új kérésnél a publicId azonnal megváltozik, de az állapotban még az előző kérés adata van:
  // azt nem adjuk vissza.
  const current = status !== null && status.public_id === publicId ? status : null;
  return { status: current, error };
}
