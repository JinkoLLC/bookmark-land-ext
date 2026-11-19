import type { ComponentProps } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

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
}: { tone: "ok" | "error" } & ComponentProps<"p">) {
  const Icon = tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <p
      className={`flex items-start gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
      {...rest}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "ok" ? "text-primary" : "text-red-600 dark:text-red-400"}`}
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
