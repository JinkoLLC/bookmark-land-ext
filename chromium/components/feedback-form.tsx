import { useState, type FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { ArrowLeft, Loader2 } from "lucide-react";
import { StatusLine } from "@/components/status-line";
import {
  PRODUCT_FEEDBACK_ACKNOWLEDGEMENT_TEXT,
  PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH,
  PRODUCT_FEEDBACK_TRIAGE_OPTIONS,
  PRODUCT_FEEDBACK_USER_AGENT_MAX_LENGTH,
  isProductFeedbackTriageType,
  type ProductFeedbackTriageType,
} from "../shared/product-feedback";

type SubmitState = "idle" | "pending" | "success" | "error";

/**
 * The browser description sent with feedback, tagged with the extension's
 * version so the team knows it came from here. No page address is sent:
 * the action only takes http(s) pages, and the page being viewed is the
 * user's browsing, not ours to forward.
 */
function feedbackUserAgent(): string {
  const tag = ` bookmark.land-extension/${browser.runtime.getManifest().version}`;
  return (navigator.userAgent + tag).slice(-PRODUCT_FEEDBACK_USER_AGENT_MAX_LENGTH);
}

const MUTED = "text-neutral-500 dark:text-neutral-400";
const BODY = "flex min-h-0 flex-col gap-3 overflow-y-auto p-3";

/**
 * Product feedback from the popup, through the same `productFeedback.submit`
 * action as bookmark.land/feedback (one email to the team per message).
 * Replaces the popup's content: only its Back row stays fixed.
 */
export function FeedbackForm({ onBack }: { onBack: () => void }) {
  const submitFeedback = useAction(api.productFeedback.submit);
  const [triageType, setTriageType] = useState<ProductFeedbackTriageType>("feature_request");
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<SubmitState>("idle");

  const canSubmit = state !== "pending" && message.trim().length > 0 && acknowledged;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setState("pending");
    try {
      await submitFeedback({
        triageType,
        message,
        acknowledgementAccepted: true,
        userAgent: feedbackUserAgent(),
      });
      setState("success");
    } catch (error) {
      console.error("[extension] Feedback failed", error);
      setState("error");
    }
  };

  const header = (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="rounded-md p-1 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <h1 className="font-semibold">Send feedback</h1>
    </header>
  );

  if (state === "success") {
    return (
      <>
        {header}
        <main className={BODY}>
          <StatusLine tone="ok" role="status" className="font-medium">
            Thanks! Your feedback was sent.
          </StatusLine>
          <p className={MUTED}>The bookmark.land team reads every message.</p>
          <button
            type="button"
            autoFocus
            onClick={onBack}
            className="rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Done
          </button>
        </main>
      </>
    );
  }

  const field =
    "w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-700";

  return (
    <>
      {header}
      <main className="flex min-h-0 flex-col overflow-y-auto">
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 p-3">
      <p className={MUTED}>
        A feature request, a bug, or anything else about bookmark.land.
      </p>
      <label className="flex flex-col gap-1">
        <span className={`text-xs font-medium ${MUTED}`}>Type</span>
        <select
          value={triageType}
          onChange={(e) => {
            if (isProductFeedbackTriageType(e.target.value)) setTriageType(e.target.value);
          }}
          className={`${field} dark:bg-neutral-900`}
        >
          {PRODUCT_FEEDBACK_TRIAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={`text-xs font-medium ${MUTED}`}>Message</span>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (state === "error") setState("idle");
          }}
          maxLength={PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH}
          rows={5}
          autoFocus
          // Keeps the placeholder out of the name.
          aria-label="Message"
          placeholder="What would make bookmark.land better?"
          className={`${field} resize-y`}
        />
      </label>
      <label className={`flex items-start gap-2 text-xs ${MUTED}`}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span>{PRODUCT_FEEDBACK_ACKNOWLEDGEMENT_TEXT}</span>
      </label>
      {state === "error" && (
        <StatusLine tone="error" role="alert" className="text-xs">
          Couldn&apos;t send your feedback. Check your connection and try again.
        </StatusLine>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        aria-describedby={acknowledged ? undefined : "feedback-missing"}
        className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground enabled:hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-neutral-200 disabled:text-neutral-600 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400"
      >
        {state === "pending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {state === "pending" ? "Sending…" : "Send feedback"}
      </button>
      {!acknowledged && (
        <p id="feedback-missing" className={`-mt-2 text-xs ${MUTED}`}>
          Tick the box above to send.
        </p>
      )}
    </form>
      </main>
    </>
  );
}
