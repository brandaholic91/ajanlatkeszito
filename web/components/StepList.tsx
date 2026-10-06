// A lépésnapló egy szakasza listaként: lépésenként a magyar név és az eltelt idő.
// A sorrend a naplóé (az adatbázis írta be, ilyen sorrendben történt), az oldal nem rendezi át.
// Háromféle sor van: kész lépés (pipa és idő), az éppen futó lépés (forgó jel), és a még hátralévők (üres kör).
import { formatSeconds, millisecondsBetween } from "@/lib/format";
import { NEXT_STEP_LABELS, WAITING_FOR_FIRST_STEP, stepLabel } from "@/lib/steps";
import type { RequestEvent } from "@/lib/types";
import { AlertIcon, DoneIcon, SpinnerIcon, UpcomingIcon } from "./Icons";

type StepListProps = {
  events: RequestEvent[];
  running: boolean; // igaz, ha ebben a szakaszban még várunk a következő lépésre
  planned: string[]; // a szakasz szokásos lépései sorrendben; ebből rajzoljuk ki előre, mi fog történni
};

// Ezek a lépések nem a szokásos úton érnek véget, ezért pipa helyett figyelmeztető jelet kapnak.
const NOTICE_STEPS = ["needs_clarification", "email_skipped"];

// Egy sor elrendezése: jel | szöveg | idő. Mindhárom sorfajta ezt használja, ezért egy helyen van.
const ROW = "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-2.5";

export function StepList({ events, running, planned }: StepListProps) {
  // Min dolgozik éppen a rendszer: az utolsó elkészült lépésből következik.
  let pendingLabel: string | null = null;
  if (running) {
    if (events.length === 0) {
      pendingLabel = WAITING_FOR_FIRST_STEP;
    } else {
      const lastStep = events[events.length - 1].step;
      pendingLabel = NEXT_STEP_LABELS[lastStep] ?? null;
    }
  }

  // A még hátralévő lépések: a tervezettek közül azok, amelyek nincsenek a naplóban.
  // Csak akkor mutatjuk őket, ha a szakasz még nem indult el, vagy éppen fut. Ha a folyamat megállt
  // (pl. visszakérdezés lett belőle), a napló már a teljes történet: nem írunk mellé meg nem történt lépést.
  let upcoming: string[] = [];
  if (running || events.length === 0) {
    const doneSteps = events.map((event) => event.step);
    upcoming = planned.filter((step) => !doneSteps.includes(step));
    if (pendingLabel !== null) {
      // Az első hátralévő lépésen éppen dolgozik a rendszer: azt a "folyamatban" sor mutatja.
      upcoming = upcoming.slice(1);
    }
  }

  return (
    // aria-live: a képernyőolvasó magától felolvassa az újonnan megjelenő sorokat.
    <ol aria-live="polite" className="border-t border-line">
      {events.map((event) => (
        <li key={event.step} className={`step-arrives ${ROW}`}>
          {NOTICE_STEPS.includes(event.step) ? (
            <span className="text-notice">
              <AlertIcon />
            </span>
          ) : (
            <span className="mt-0.5 text-brand">
              <DoneIcon />
            </span>
          )}
          <span>{stepLabel(event.step)}</span>
          {/* Az idő a szakasz első lépésétől számít, az adatbázis órája szerint. */}
          <span className="num text-sm leading-6 text-muted">
            +{formatSeconds(millisecondsBetween(events[0].at, event.at))}
          </span>
        </li>
      ))}

      {pendingLabel !== null && (
        <li className={ROW}>
          <span className="mt-0.5 text-brand">
            <SpinnerIcon />
          </span>
          <span className="font-medium">{pendingLabel}</span>
          <span />
        </li>
      )}

      {upcoming.map((step) => (
        <li key={step} className={`${ROW} text-muted`}>
          <span className="mt-0.5">
            <UpcomingIcon />
          </span>
          <span>{stepLabel(step)}</span>
          <span className="num text-sm leading-6">–</span>
        </li>
      ))}
    </ol>
  );
}
