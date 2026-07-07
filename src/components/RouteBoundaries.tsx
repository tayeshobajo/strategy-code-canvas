import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, FileQuestion } from "lucide-react";

/**
 * U1 (audit): shared default error boundary for routes that don't provide
 * their own. Reset clears the boundary AND invalidates the loader so the
 * failed data-fetch actually re-runs.
 */
export function DefaultErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className="mx-auto max-w-xl my-16 rounded-xl border border-[#f3ced5] bg-[#fbe9ec] p-6 text-[#5a1424]"
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="w-4 h-4" />
        Something went wrong
      </div>
      <p className="text-sm mt-2 text-[#5a1424]/80">
        {error.message || "An unexpected error occurred while loading this view."}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => {
            reset();
            router.invalidate();
          }}
          className="bg-ink text-white text-xs px-3 py-1.5 rounded-md hover:bg-ink/90"
        >
          Try again
        </button>
        <Link to="/" className="text-xs text-ink/70 hover:text-ink self-center">
          Go home
        </Link>
      </div>
    </div>
  );
}

/**
 * U1 (audit): default not-found fallback used when a route matches nothing.
 */
export function DefaultNotFoundComponent() {
  return (
    <div className="mx-auto max-w-xl my-16 text-center">
      <FileQuestion className="w-10 h-10 mx-auto text-ink/40" />
      <h2 className="font-display text-2xl text-ink mt-3">Nothing here</h2>
      <p className="text-sm text-ink/60 mt-2">
        The page you're looking for doesn't exist or you don't have access.
      </p>
      <Link
        to="/"
        className="inline-block mt-4 text-xs text-royal hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
