// A jóváhagyás: a néző itt az értékesítő szerepét játssza. A „Mehet” gomb után a jóváhagyás lépései,
// majd a PDF letöltése és az, hogy mi lett a levéllel.
// Az elrendezés ugyanaz, mint az oldal tetején: balra az, amit az ember csinál, jobbra a rendszer naplója.
import { pdfUrl } from "@/lib/api-client";
import type { RequestEvent } from "@/lib/types";
import { ErrorMessage } from "./ErrorMessage";
import { AlertIcon, DoneIcon, DownloadIcon, SpinnerIcon } from "./Icons";
import { StepList } from "./StepList";

// A jóváhagyás szokásos lépései, sorrendben.
const APPROVAL_STEPS = ["approved", "pdf_stored", "sent"];

type ApprovalPanelProps = {
  publicId: string;
  canApprove: boolean; // igaz, amíg a kérés "priced" állapotú, vagyis még senki nem hagyta jóvá
  approving: boolean; // igaz, amíg a jóváhagyó hívás úton van
  approvalEvents: RequestEvent[];
  approvalRunning: boolean;
  pdfAvailable: boolean;
  email: "sent" | "skipped" | null;
  error: string | null;
  onApprove: () => void;
};

export function ApprovalPanel(props: ApprovalPanelProps) {
  return (
    <section
      aria-labelledby="approval-heading"
      className="grid gap-8 border-t border-line pt-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-12"
    >
      <div className="flex flex-col items-start gap-4">
        <h2 id="approval-heading" className="text-xl font-semibold">
          Jóváhagyás
        </h2>

        {props.canApprove && (
          <>
            <p className="max-w-[65ch]">
              Most te vagy az értékesítő: nézd át az ajánlatot, és ha rendben van, mehet az ügyfélnek.
            </p>
            <button
              type="button"
              className="button-primary w-full min-w-40 sm:w-auto"
              disabled={props.approving}
              aria-busy={props.approving}
              onClick={props.onApprove}
            >
              {props.approving && <SpinnerIcon />}
              Mehet
            </button>
          </>
        )}

        {/* A gomb megnyomása és a kész PDF közötti rövid idő: a bal oldal ne maradjon üresen. */}
        {!props.canApprove && !props.pdfAvailable && props.error === null && (
          <p className="text-muted">Jóváhagyva. A PDF innen lesz letölthető, amint elkészült.</p>
        )}

        {props.error !== null && <ErrorMessage message={props.error} />}

        {props.pdfAvailable && (
          // Sima link, gombnak öltöztetve: a böngésző tölti le a fájlt a saját szerverünkről,
          // amely a tárolóból adja tovább.
          <a className="button-primary w-full sm:w-auto" href={pdfUrl(props.publicId)}>
            <DownloadIcon />
            Az ajánlat letöltése (PDF)
          </a>
        )}

        {props.email === "sent" && (
          <p className="flex gap-2.5">
            <span className="mt-0.5 text-ok">
              <DoneIcon />
            </span>
            <span>Az ajánlat e-mailben is elment a megadott címre.</span>
          </p>
        )}
        {props.email === "skipped" && (
          <p className="flex max-w-[65ch] gap-2.5 rounded-md border border-notice-line bg-notice-soft p-3">
            <span className="text-notice">
              <AlertIcon />
            </span>
            <span>
              A demó mai levélkerete betelt, ezért e-mail most nem ment. A PDF ettől függetlenül elkészült, és innen
              letölthető.
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-soft p-5 sm:p-6">
        <h3 className="font-semibold">A jóváhagyás lépései</h3>
        <StepList events={props.approvalEvents} running={props.approvalRunning} planned={APPROVAL_STEPS} />
      </div>
    </section>
  );
}
