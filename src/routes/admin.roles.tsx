import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  listUserRoles,
  grantUserRole,
  revokeUserRole,
  type UserRoleRow,
} from "@/lib/roles.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Role = "admin" | "operator" | "user";
const ROLES: Role[] = ["admin", "operator", "user"];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SORT_KEYS = ["email", "role", "granted_at", "granted_by"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  role: fallback(z.enum(["all", ...ROLES]), "all").default("all"),
  sort: fallback(z.enum(SORT_KEYS), "granted_at").default("granted_at"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  page: fallback(z.number().int().min(1), 1).default(1),
  size: fallback(z.number().int().min(10).max(100), 25).default(25),
});

export const Route = createFileRoute("/admin/roles")({
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  component: RolesPage,
});

function RolesPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/roles" });

  const list = useServerFn(listUserRoles);
  const grant = useServerFn(grantUserRole);
  const revoke = useServerFn(revokeUserRole);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user-roles"],
    queryFn: () => list(),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<UserRoleRow | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "user-roles"] });

  const grantMut = useMutation({
    mutationFn: (input: { email: string; role: Role }) => grant({ data: input }),
    onSuccess: () => {
      toast.success(`Granted ${role} to ${email.trim().toLowerCase()}`);
      setEmail("");
      setEmailError(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(friendlyError(e.message)),
  });

  const revokeMut = useMutation({
    mutationFn: (input: { email: string; role: Role }) => revoke({ data: input }),
    onSuccess: (r, vars) => {
      if (r.removed > 0) toast.success(`Revoked ${vars.role} from ${vars.email}`);
      else toast.message("Nothing to revoke", { description: "That role was not assigned." });
      setPendingRevoke(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(friendlyError(e.message));
      setPendingRevoke(null);
    },
  });

  const rows = data?.rows ?? [];
  const adminCount = useMemo(() => rows.filter((r) => r.role === "admin").length, [rows]);

  // Filter → sort → paginate.
  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (search.role !== "all" && r.role !== search.role) return false;
      if (q && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search.q, search.role]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = search.dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const av = (a[search.sort] ?? "") as string;
      const bv = (b[search.sort] ?? "") as string;
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return copy;
  }, [filtered, search.sort, search.dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / search.size));
  const currentPage = Math.min(search.page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * search.size, currentPage * search.size);

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const onSort = (key: SortKey) => {
    if (search.sort === key) setSearch({ dir: search.dir === "asc" ? "desc" : "asc", page: 1 });
    else setSearch({ sort: key, dir: "asc", page: 1 });
  };

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return setEmailError("Email is required.");
    if (trimmed.length > 255) return setEmailError("Email is too long.");
    if (!EMAIL_RE.test(trimmed)) return setEmailError("Enter a valid email address.");
    const existing = rows.find((r) => r.email.toLowerCase() === trimmed && r.role === role);
    if (existing) return setEmailError(`${trimmed} already has the ${role} role.`);
    setEmailError(null);
    grantMut.mutate({ email: trimmed, role });
  };

  const isLastAdmin =
    pendingRevoke?.role === "admin" && adminCount <= 1;

  const arrow = (key: SortKey) =>
    search.sort === key ? (search.dir === "asc" ? "▲" : "▼") : "";

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold mb-2">User roles</h1>
      <p className="text-white/60 text-sm mb-6">
        Grant or revoke admin, operator, or user roles by email. Changes take effect immediately.
      </p>

      {/* Grant form */}
      <form
        className="mb-8 rounded-lg border border-white/10 bg-white/5 p-4"
        onSubmit={handleGrant}
        noValidate
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="grant-email" className="text-xs uppercase tracking-widest text-white/50">
              Email
            </label>
            <input
              id="grant-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              placeholder="person@example.com"
              aria-invalid={emailError ? "true" : "false"}
              aria-describedby={emailError ? "grant-email-error" : undefined}
              className={`mt-1 w-full rounded border bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                emailError
                  ? "border-red-500/60 focus:ring-red-400"
                  : "border-white/10 focus:ring-amber-400"
              }`}
            />
          </div>
          <div>
            <label htmlFor="grant-role" className="text-xs uppercase tracking-widest text-white/50">
              Role
            </label>
            <select
              id="grant-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={grantMut.isPending}
            className="rounded bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {grantMut.isPending ? "Granting…" : "Grant role"}
          </button>
        </div>
        {emailError && (
          <p id="grant-email-error" className="mt-2 text-xs text-red-300">{emailError}</p>
        )}
      </form>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search.q}
          onChange={(e) => setSearch({ q: e.target.value, page: 1 })}
          placeholder="Search by email…"
          aria-label="Search by email"
          className="flex-1 min-w-[220px] rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        <select
          value={search.role}
          onChange={(e) => setSearch({ role: e.target.value as typeof search.role, page: 1 })}
          aria-label="Filter by role"
          className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={search.size}
          onChange={(e) => setSearch({ size: Number(e.target.value), page: 1 })}
          aria-label="Rows per page"
          className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-white/60">Loading…</div>}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
                <tr>
                  <SortableTh label="Email" k="email" active={search.sort} arrow={arrow("email")} onClick={onSort} />
                  <SortableTh label="Role" k="role" active={search.sort} arrow={arrow("role")} onClick={onSort} />
                  <SortableTh label="Granted by" k="granted_by" active={search.sort} arrow={arrow("granted_by")} onClick={onSort} />
                  <SortableTh label="Granted at" k="granted_at" active={search.sort} arrow={arrow("granted_at")} onClick={onSort} />
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-white/40">
                      {sorted.length === 0 && rows.length > 0
                        ? "No matches for the current filters."
                        : "No role assignments."}
                    </td>
                  </tr>
                )}
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="px-4 py-2 font-mono text-white">{r.email}</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-widest">
                        {r.role}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-white/60">{r.granted_by ?? "—"}</td>
                    <td className="px-4 py-2 text-white/60">
                      {new Date(r.granted_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setPendingRevoke(r)}
                        disabled={revokeMut.isPending}
                        className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
            <div>
              {sorted.length === 0
                ? "0 results"
                : `Showing ${(currentPage - 1) * search.size + 1}–${Math.min(
                    currentPage * search.size,
                    sorted.length,
                  )} of ${sorted.length}`}
            </div>
            <div className="flex items-center gap-2">
              <PagerBtn disabled={currentPage <= 1} onClick={() => setSearch({ page: currentPage - 1 })}>
                Previous
              </PagerBtn>
              <span>Page {currentPage} of {totalPages}</span>
              <PagerBtn disabled={currentPage >= totalPages} onClick={() => setSearch({ page: currentPage + 1 })}>
                Next
              </PagerBtn>
            </div>
          </div>
        </>
      )}

      {/* Revoke confirmation */}
      <AlertDialog open={!!pendingRevoke} onOpenChange={(o) => !o && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isLastAdmin ? "Cannot revoke the last admin" : `Revoke ${pendingRevoke?.role} role?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isLastAdmin
                ? `${pendingRevoke?.email} is the only remaining admin. Grant admin to another account before revoking this one, otherwise no one will be able to manage roles.`
                : `This removes the ${pendingRevoke?.role} role from ${pendingRevoke?.email}. They lose access immediately. This cannot be undone from here — you would need to grant the role again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!isLastAdmin && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (!pendingRevoke) return;
                  revokeMut.mutate({ email: pendingRevoke.email, role: pendingRevoke.role });
                }}
                disabled={revokeMut.isPending}
                className="bg-red-500 text-white hover:bg-red-600"
              >
                {revokeMut.isPending ? "Revoking…" : "Yes, revoke"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableTh({
  label,
  k,
  active,
  arrow,
  onClick,
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  arrow: string;
  onClick: (k: SortKey) => void;
}) {
  return (
    <th className="px-4 py-2">
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-white ${active === k ? "text-white" : ""}`}
        aria-sort={active === k ? (arrow === "▲" ? "ascending" : "descending") : "none"}
      >
        {label} <span aria-hidden>{arrow}</span>
      </button>
    </th>
  );
}

function PagerBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-white/10 px-2 py-1 text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("last remaining admin")) return "You can’t revoke the only remaining admin.";
  if (m.includes("your own admin role")) return "You can’t revoke your own admin role.";
  if (m.includes("forbidden")) return "You don’t have permission to change roles.";
  if (m.includes("invalid email")) return "That email address isn’t valid.";
  if (m.includes("unauthorized")) return "Your session expired. Sign in again.";
  return message || "Something went wrong.";
}
