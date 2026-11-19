import type { ComponentProps } from "react";
import { CircleAlert, CircleCheck, CirclePause } from "lucide-react";

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
}: { tone: "ok" | "error" | "paused" } & ComponentProps<"p">) {
  const Icon = tone === "ok" ? CircleCheck : tone === "paused" ? CirclePause : CircleAlert;
  return (
    <p
      // Not a control: it may take focus after a state change, but shows no ring.
      className={`flex items-start gap-1.5 outline-none ${className}`}
      {...rest}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "ok" ? "text-primary" : tone === "paused" ? "text-neutral-500 dark:text-neutral-400" : "text-red-600 dark:text-red-400"}`}
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
