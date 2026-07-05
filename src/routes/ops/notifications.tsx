import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  listOperatorNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/operator-notifications.functions";
import { Card, PageHeader } from "@/components/ops/Primitives";
import { Button } from "@/components/ui/button";
import { Bell, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

const searchSchema = z.object({
  filter: z.enum(["all", "unread"]).optional(),
  submission: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/ops/notifications")({
  validateSearch: searchSchema,
  component: NotificationsPage,
});

function NotificationsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter = search.filter ?? "all";
  const submissionId = search.submission;
  const page = search.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const listFn = useServerFn(listOperatorNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const qc = useQueryClient();

  const notifs = useQuery({
    queryKey: ["operator-notifications", "full", filter, submissionId ?? "", page],
    queryFn: () =>
      listFn({
        data: {
          limit: PAGE_SIZE,
          offset,
          unread_only: filter === "unread",
          submission_id: submissionId,
        },
      }),
    refetchInterval: 30_000,
  });

  // Realtime: refresh the inbox instantly when a new operator notification lands.
  useEffect(() => {
    const channel = supabase
      .channel("operator-notifications-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operator_notifications" },
        () => {
          qc.invalidateQueries({ queryKey: ["operator-notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-notifications"] }),
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn({}),
    onSuccess: (r) => {
      toast.success(`Marked ${r.marked ?? 0} as read`);
      qc.invalidateQueries({ queryKey: ["operator-notifications"] });
    },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const items = notifs.data?.items ?? [];
  const unread = notifs.data?.unread ?? 0;
  const total = notifs.data?.total ?? items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setSearch = (patch: Record<string, string | number | undefined>) =>
    navigate({
      search: (s: Record<string, unknown>) => ({ ...s, ...patch, page: patch.page ?? 1 }),
    });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread · ${total} in view`}
        right={
          <Button
            variant="outline"
            disabled={markAll.isPending || unread === 0}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Mark all read
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-[#e0e0d8] bg-white text-xs">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSearch({ filter: f === "all" ? undefined : f })}
              className={`px-3 py-1.5 ${
                filter === f
                  ? "bg-[#171c38] text-white"
                  : "text-[#5d6079] hover:bg-[#f9f8f2]"
              }`}
            >
              {f === "all" ? "All" : "Unread"}
            </button>
          ))}
        </div>
        {submissionId ? (
          <button
            type="button"
            onClick={() => setSearch({ submission: undefined })}
            className="inline-flex items-center gap-1 rounded-md border border-[#e0e0d8] bg-white px-2.5 py-1.5 text-xs text-[#5d6079] hover:bg-[#f9f8f2]"
          >
            Filtered by intake · {submissionId.slice(0, 8)}
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <Card className="mt-4 divide-y divide-[#f3f2ec]">
        {notifs.isLoading ? (
          <div className="p-8 text-center text-sm text-[#5d6079]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="mx-auto h-6 w-6 text-[#5d6079]" />
            <div className="mt-3 text-sm text-[#5d6079]">
              {filter === "unread" ? "No unread notifications." : "No notifications yet."}
            </div>
          </div>
        ) : (
          items.map((n) => {
            const isUnread = n.read_at === null;
            return (
              <div key={n.id} className="flex items-start gap-3 p-4">
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    isUnread ? "bg-amber-500" : "bg-transparent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <div className="text-sm font-medium text-[#171c38]">{n.title}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[#5d6079]">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  {n.body ? (
                    <div className="mt-1 text-sm text-[#5d6079]">{n.body}</div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    {n.href ? (
                      <Link
                        to={n.href}
                        onClick={() => isUnread && markOne.mutate(n.id)}
                        className="text-xs uppercase tracking-widest text-[#5d6079] hover:text-[#171c38]"
                      >
                        Open →
                      </Link>
                    ) : null}
                    {n.submission_id && n.submission_id !== submissionId ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSearch({ submission: n.submission_id ?? undefined })
                        }
                        className="text-xs uppercase tracking-widest text-[#5d6079] hover:text-[#171c38]"
                      >
                        Filter this intake
                      </button>
                    ) : null}
                  </div>
                </div>
                {isUnread ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markOne.mutate(n.id)}
                    disabled={markOne.isPending}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Mark read
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </Card>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-[#5d6079]">
          <div>
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setSearch({ page: page - 1 })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setSearch({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
