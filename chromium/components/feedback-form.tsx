import { useState, type FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
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

/**
 * Product feedback from the popup, through the same `productFeedback.submit`
 * action as bookmark.land/feedback (one email to the team per message).
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="rounded-md p-1 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <h2 className="font-semibold">Send feedback</h2>
    </div>
  );

  if (state === "success") {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <p className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
          <Check className="h-4 w-4" aria-hidden="true" /> Thanks! Your feedback was sent.
        </p>
        <p className="text-neutral-500">The bookmark.land team reads every message.</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Done
        </button>
      </div>
    );
  }

  const field =
    "w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700";

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      {header}
      <p className="text-neutral-500">
        A feature request, a bug, or anything else about bookmark.land.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">Type</span>
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
        <span className="text-xs font-medium text-neutral-500">Message</span>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (state === "error") setState("idle");
          }}
          maxLength={PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH}
          rows={5}
          autoFocus
          placeholder="What would make bookmark.land better?"
          className={`${field} resize-y`}
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
        />
        <span>{PRODUCT_FEEDBACK_ACKNOWLEDGEMENT_TEXT}</span>
      </label>
      {state === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Couldn&apos;t send your feedback. Check your connection and try again.
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {state === "pending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {state === "pending" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
