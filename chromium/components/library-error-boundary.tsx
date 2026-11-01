import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render-time errors from the library views — most importantly the
 * ConvexError("Not authenticated") that convex/react rethrows at useQuery
 * call sites when auth dies mid-session (e.g. a dev-browser JWT invalidated
 * while the surface is open). Without a boundary React unmounts the whole
 * tree — a blank popup/panel. Retry reloads the document, which re-runs the
 * dev-browser cookie repair before clerk-js mounts again.
 */
export class LibraryErrorBoundary extends Component<
  { children: ReactNode; fallbackClassName?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("[extension] Unable to load library view", {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  retry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <LibraryErrorFallback
          onRetry={this.retry}
          className={this.props.fallbackClassName}
        />
      );
    }

    return this.props.children;
  }
}

export function LibraryErrorFallback({
  onRetry,
  className,
}: {
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-red-600 dark:text-red-400">
          Unable to load your library
        </p>
        <p className="text-neutral-500">
          Check your connection, then retry or reopen this window.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Retry
      </button>
    </div>
  );
}
