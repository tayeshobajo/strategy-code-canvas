import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listOperatorNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/operator-notifications.functions";

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell() {
  const listFn = useServerFn(listOperatorNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const notifs = useQuery({
    queryKey: ["operator-notifications"],
    queryFn: () => listFn({ data: { limit: 20, unread_only: false } }),
    refetchInterval: 30_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Realtime: refresh unread badge the instant a new operator notification
  // lands, instead of waiting up to 30s for the poll interval.
  useEffect(() => {
    const channel = supabase
      .channel("operator-notifications-bell")
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

  const unread = notifs.data?.unread ?? 0;
  const items = notifs.data?.items ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className="relative rounded-md p-1.5 text-white/70 hover:bg-white/5 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-medium text-[#0c1130]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[360px] rounded-md border border-[#e7e6df] bg-white text-[#171c38] shadow-lg">
          <div className="flex items-center justify-between border-b border-[#eee] px-3 py-2">
            <div className="text-sm font-medium">Notifications</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending || unread === 0}
                className="text-[11px] text-[#5d6079] hover:text-[#171c38] disabled:opacity-40"
              >
                Mark all read
              </button>
              <Link
                to="/ops/notifications"
                onClick={() => setOpen(false)}
                className="text-[11px] text-[#5d6079] hover:text-[#171c38]"
              >
                View all
              </Link>
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[#5d6079]">
                {notifs.isLoading ? "Loading…" : "No notifications yet."}
              </div>
            ) : (
              items.map((n) => {
                const isUnread = n.read_at === null;
                const content = (
                  <div
                    className={`flex items-start gap-2 border-b border-[#f3f2ec] px-3 py-2.5 text-left last:border-b-0 ${
                      isUnread ? "bg-amber-50/40" : ""
                    }`}
                  >
                    <div
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        isUnread ? "bg-amber-500" : "bg-transparent"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{n.title}</div>
                      {n.body ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-[#5d6079]">{n.body}</div>
                      ) : null}
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-[#5d6079]">
                        {timeAgo(n.created_at)} ago
                      </div>
                    </div>
                    {isUnread ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markOne.mutate(n.id);
                        }}
                        className="shrink-0 rounded p-1 text-[#5d6079] hover:bg-[#f3f2ec] hover:text-[#171c38]"
                        aria-label="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
                if (n.href) {
                  return (
                    <Link
                      key={n.id}
                      to={n.href}
                      onClick={() => {
                        setOpen(false);
                        if (isUnread) markOne.mutate(n.id);
                      }}
                      className="block hover:bg-[#f9f8f2]"
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <div key={n.id} className="hover:bg-[#f9f8f2]">
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
