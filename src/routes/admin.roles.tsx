import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listUserRoles, grantUserRole, revokeUserRole, type UserRoleRow } from "@/lib/roles.functions";

export const Route = createFileRoute("/admin/roles")({
  ssr: false,
  component: RolesPage,
});

type Role = "admin" | "operator" | "user";
const ROLES: Role[] = ["admin", "operator", "user"];

function RolesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listUserRoles);
  const grant = useServerFn(grantUserRole);
  const revoke = useServerFn(revokeUserRole);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user-roles"],
    queryFn: () => list(),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "user-roles"] });

  const grantMut = useMutation({
    mutationFn: (input: { email: string; role: Role }) => grant({ data: input }),
    onSuccess: () => {
      toast.success("Role granted");
      setEmail("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (input: { email: string; role: Role }) => revoke({ data: input }),
    onSuccess: (r) => {
      toast.success(r.removed > 0 ? "Role revoked" : "No role to revoke");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: UserRoleRow[] = data?.rows ?? [];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-2">User roles</h1>
      <p className="text-white/60 text-sm mb-6">
        Grant or revoke admin, operator, or user roles by email. Changes take
        effect immediately.
      </p>

      <form
        className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = email.trim().toLowerCase();
          if (!trimmed) return;
          grantMut.mutate({ email: trimmed, role });
        }}
      >
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs uppercase tracking-widest text-white/50">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50">Role</label>
          <select
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
      </form>

      {isLoading && <div className="text-white/60">Loading…</div>}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Granted by</th>
                <th className="px-4 py-2">Granted at</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-white/40">
                    No role assignments.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
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
                      onClick={() => {
                        if (!confirm(`Revoke ${r.role} from ${r.email}?`)) return;
                        revokeMut.mutate({ email: r.email, role: r.role });
                      }}
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
      )}
    </div>
  );
}
