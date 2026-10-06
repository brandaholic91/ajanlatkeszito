"use client"; // Ez a komponens a böngészőben fut: állapota van és eseményeket kezel. (Enélkül csak a szerveren rajzolódna ki.)

// A demó "karmestere": itt van minden állapot és esemény. A többi komponens csak megjeleníti, amit innen kap.
import { useState } from "react";
import { approveRequest, createRequest } from "@/lib/api-client";
import { emailOutcome, isInProgress, splitEvents } from "@/lib/steps";
import { useElapsed } from "@/lib/useElapsed";
import { useRequestStatus } from "@/lib/useRequestStatus";
import { ApprovalPanel } from "./ApprovalPanel";
import { Clarification } from "./Clarification";
import { ErrorMessage } from "./ErrorMessage";
import { ProcessLog } from "./ProcessLog";
import { QuoteSection } from "./QuoteSection";
import { RequestForm } from "./RequestForm";

export function Demo() {
  // Az űrlap mezői.
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");

  // Az éppen futó kérés. A publicId null, amíg a néző nem küldött be semmit.
  const [publicId, setPublicId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null); // mikor nyomta meg a gombot (az órához)

  // A két hosszú hívás állapota: fut-e éppen, és ha hibával ért véget, mi volt az üzenet.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Az állapot figyelése: a hook fél másodpercenként lekérdezi a kérést, amíg van mire várni.
  // Hiba után megáll, különben egy elakadt kérést örökké figyelne.
  const failed = submitError !== null || approveError !== null;
  const { status, error: pollError } = useRequestStatus(publicId, submitting || approving, failed);

  // Ezek nem külön állapotok, hanem a fentiekből minden kirajzoláskor újraszámolt értékek.
  const events = status === null ? [] : status.events;
  const { processing, approval } = splitEvents(events);
  // waiting: a napló szerint a rendszer még dolgozik (nem a nézőre vár).
  const waiting = !failed && status !== null && isInProgress(events);
  const processingRunning = !failed && approval.length === 0 && (submitting || waiting);
  const approvalRunning = !failed && (approving || (approval.length > 0 && waiting));

  // Az óra a beküldéstől addig fut, amíg a feldolgozás (az első szakasz) tart.
  const elapsed = useElapsed(startedAt, processingRunning);

  async function handleSubmit() {
    // Az azonosítót a böngésző generálja, így az állapotot azonnal figyelni tudjuk,
    // miközben a beküldő hívás még úton van (az csak a feldolgozás végén tér vissza).
    const id = crypto.randomUUID();
    setPublicId(id);
    setStartedAt(Date.now());
    setSubmitError(null);
    setApproveError(null);
    setSubmitting(true);
    try {
      await createRequest(id, email, text);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Ismeretlen hiba.");
    } finally {
      // A finally ág hiba esetén is lefut: a gomb semmiképp se ragadjon "folyamatban" állapotban.
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    if (publicId === null) {
      return;
    }
    setApproveError(null);
    setApproving(true);
    try {
      await approveRequest(publicId);
    } catch (caught) {
      setApproveError(caught instanceof Error ? caught.message : "Ismeretlen hiba.");
    } finally {
      setApproving(false);
    }
  }

  const busy = submitting || approving || waiting;

  // A naplópanel "üres" állapota: még nincs kérés, vagy a beküldés hibával ért véget.
  const idle = publicId === null || submitError !== null;

  return (
    <div className="flex flex-col gap-10 lg:gap-12">
      {/* Felső sor: balra az űrlap (a néző dolga), jobbra a napló (a rendszer dolga). Keskeny képernyőn egymás alatt. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-12">
        <div className="flex flex-col gap-4">
          <RequestForm
            text={text}
            email={email}
            disabled={busy}
            submitting={submitting}
            onTextChange={setText}
            onEmailChange={setEmail}
            onSubmit={handleSubmit}
          />
          {/* A && jelentése JSX-ben: a jobb oldal csak akkor rajzolódik ki, ha a bal oldal igaz. */}
          {submitError !== null && <ErrorMessage message={submitError} />}
        </div>

        <ProcessLog
          idle={idle}
          elapsed={elapsed}
          events={processing}
          running={processingRunning}
          pollError={pollError}
        />
      </div>

      {status !== null && status.status === "needs_clarification" && <Clarification problems={status.problems} />}

      {status !== null && status.quotes.length > 0 && (
        // A key miatt új kérésnél a React újra létrehozza a komponenst, így a változatkapcsoló alaphelyzetbe áll.
        <QuoteSection key={status.public_id} quotes={status.quotes} />
      )}

      {publicId !== null && status !== null && status.quotes.length > 0 && (
        <ApprovalPanel
          publicId={publicId}
          canApprove={status.status === "priced"}
          approving={approving}
          approvalEvents={approval}
          approvalRunning={approvalRunning}
          pdfAvailable={status.pdf_available}
          email={emailOutcome(events)}
          error={approveError}
          onApprove={handleApprove}
        />
      )}
    </div>
  );
}
