import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment received | Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        {session_id ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">Payment received.</h1>
            <p className="mt-4 text-base text-muted-foreground">
              Within one business day, you get one reply. From a person, by name. Not a sequence.
            </p>
            <p className="mt-2 text-xs text-muted-foreground/70">Reference: {session_id}</p>
            <div className="mt-8">
              <Link to="/" className="underline text-sm">
                Return home
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">No session found.</h1>
            <p className="mt-4 text-sm">
              <Link to="/checkout/roadmap" className="underline">
                Return to checkout
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
