// A feldolgozás naplója és az óra: az oldal legfontosabb része. Halvány kék háttéren áll, mint minden,
// amit nem a néző, hanem a rendszer ír.
import { formatSeconds } from "@/lib/format";
import type { RequestEvent } from "@/lib/types";
import { ErrorMessage } from "./ErrorMessage";
import { StepList } from "./StepList";

// A feldolgozás szokásos lépései, sorrendben. Ebből látszik előre, mi fog történni.
const PROCESSING_STEPS = ["received", "extracted", "checked", "priced"];

type ProcessLogProps = {
  idle: boolean; // igaz, amíg nincs beküldött kérés (vagy a beküldés hibával ért véget)
  elapsed: number; // ezredmásodperc a beküldés óta
  events: RequestEvent[];
  running: boolean;
  pollError: string | null;
};

export function ProcessLog({ idle, elapsed, events, running, pollError }: ProcessLogProps) {
  return (
    <section aria-labelledby="log-heading" className="flex flex-col gap-4 rounded-lg bg-soft p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="log-heading" className="text-xl font-semibold">
          Mi történik éppen
        </h2>
        {/* Az óra. A role="timer" jelzi a képernyőolvasónak, hogy ez futó idő (nem olvassa fel minden változását). */}
        <p className="text-right">
          <span className="block text-xs text-muted">Eltelt idő a beküldés óta</span>
          <span role="timer" className={`num block text-3xl font-semibold ${idle ? "text-muted" : "text-ink"}`}>
            {formatSeconds(idle ? 0 : elapsed)}
          </span>
        </p>
      </div>

      {idle && (
        <p className="text-sm text-muted">
          Még nincs beküldött kérés. Beküldés után ezek a lépések futnak le, mindegyik mellett az idejével.
        </p>
      )}

      <StepList events={idle ? [] : events} running={!idle && running} planned={PROCESSING_STEPS} />

      {!idle && pollError !== null && <ErrorMessage message={pollError} />}
    </section>
  );
}
