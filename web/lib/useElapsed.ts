"use client"; // a böngészőben fut

// Saját hook a futó órához: megadja, hány ezredmásodperc telt el a startedAt óta.
// Amíg a "running" igaz, tizedmásodpercenként frissül; utána megáll az utolsó értéken.
import { useEffect, useState } from "react";

const TICK_MS = 100;

export function useElapsed(startedAt: number | null, running: boolean): number {
  // Az utolsó "most", amit az óra látott (ezredmásodperc 1970 óta, mint Pythonban a time.time() * 1000).
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    // Takarítás: ha az óra megáll (running hamis lesz) vagy a komponens eltűnik, az időzítőt le kell állítani.
    // Megálláskor még egyszer leolvassuk az időt, hogy a kiírt végérték pontos legyen, ne az utolsó tizedmásodpercé.
    return () => {
      clearInterval(timer);
      setNow(Date.now());
    };
  }, [running]);

  if (startedAt === null) {
    return 0;
  }
  // A max azért kell, mert új kérés indításakor a "now" egy pillanatig még az előző kérés idejét mutatja.
  return Math.max(0, now - startedAt);
}
