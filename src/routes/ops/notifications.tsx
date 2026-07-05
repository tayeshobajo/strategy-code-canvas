import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOperatorNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/operator-notifications.functions";
import { Card, PageHeader } from "@/components/ops/Primitives";
import { Button } from "@/components/ui/button";
import { Bell, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ops/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const listFn = useServerFn(listOperatorNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const qc = useQueryClient();

  const notifs = useQuery({
    queryKey: ["operator-notifications", "full"],
    queryFn: () => listFn({ data: { limit: 100, unread_only: false } }),
    refetchInterval: 30_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operator-notifications"] });
    },
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

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        eyebrow="Ops"
        title="Notifications"
        subtitle={`${unread} unread`}
        actions={
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

      <Card className="mt-6 divide-y divide-[#f3f2ec]">
        {notifs.isLoading ? (
          <div className="p-8 text-center text-sm text-[#5d6079]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="mx-auto h-6 w-6 text-[#5d6079]" />
            <div className="mt-3 text-sm text-[#5d6079]">No notifications yet.</div>
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
                  {n.href ? (
                    <Link
                      to={n.href}
                      onClick={() => isUnread && markOne.mutate(n.id)}
                      className="mt-2 inline-block text-xs uppercase tracking-widest text-[#5d6079] hover:text-[#171c38]"
                    >
                      Open →
                    </Link>
                  ) : null}
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
    </div>
  );
}
