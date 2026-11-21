import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * The fixed Back row of a view that replaces the popup's content. With
 * `focusOnOpen` the heading takes focus when the view opens, so focus never
 * stays on a control that is no longer on screen (the feedback form focuses
 * its message field instead).
 */
export function ViewHeader({
  title,
  id,
  onBack,
  focusOnOpen = false,
}: {
  title: string;
  id?: string;
  onBack: () => void;
  focusOnOpen?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen]);
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex h-7 items-center gap-1 rounded-md px-1.5 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
      <h1
        ref={heading}
        id={id}
        tabIndex={-1}
        className="rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {title}
      </h1>
    </header>
  );
}
