import type { ComponentProps } from "react";
import { CircleAlert, CircleCheck, CirclePause, Link } from "lucide-react";

/**
 * An outcome as a coloured icon beside neutral text, so colour is never the
 * only signal. The caller sets the role (status, alert) and, for a line that
 * takes focus after a state change, `tabIndex={-1}`.
 */
export function StatusLine({
  tone,
  className = "",
  children,
  ...rest
}: {
  /** "link": a short link that was already there, which is no success of this visit. */
  tone: "ok" | "error" | "paused" | "link";
} & ComponentProps<"p">) {
  const Icon = tone === "ok" ? CircleCheck : tone === "paused" ? CirclePause : tone === "link" ? Link : CircleAlert;
  return (
    <p
      // Not a control: it may take focus after a state change, but shows no ring.
      className={`flex items-start gap-1.5 outline-none ${className}`}
      {...rest}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "ok" ? "text-primary" : tone === "paused" || tone === "link" ? "text-neutral-500 dark:text-neutral-400" : "text-red-600 dark:text-red-400"}`}
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
