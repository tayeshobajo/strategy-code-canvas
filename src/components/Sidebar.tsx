"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getProductions, PRODUCTIONS_CHANGED_EVENT } from "@/lib/studio-store";
import {
  thinkingRoomCount,
  approvalDeskCount,
  filmStudioCount,
} from "@/lib/studio-badges";
import {
  LayoutDashboard,
  Lightbulb,
  CheckSquare,
  Clapperboard,
  BookOpen,
  Settings,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: "thinking" | "approval" | "film";
}

const navItems: NavItem[] = [
  { label: "Command Center", href: "/", icon: LayoutDashboard },
  { label: "Thinking Room", href: "/thinking-room", icon: Lightbulb, badgeKey: "thinking" },
  { label: "Approval Desk", href: "/approvals", icon: CheckSquare, badgeKey: "approval" },
  { label: "Film Studio", href: "/film-studio", icon: Clapperboard, badgeKey: "film" },
  { label: "Library", href: "/library", icon: BookOpen },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [badges, setBadges] = useState({ thinking: 0, approval: 0, film: 0 });

  useEffect(() => {
    const load = () => {
      const p = getProductions();
      setBadges({
        thinking: thinkingRoomCount(p),
        approval: approvalDeskCount(p),
        film: filmStudioCount(p),
      });
    };
    load();
    window.addEventListener(PRODUCTIONS_CHANGED_EVENT, load);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PRODUCTIONS_CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href + "?");

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-[280px] flex flex-col z-50 transform transition-transform duration-200 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "#0D1626" }}
      >
        {/* Wordmark */}
        <div className="flex items-center justify-between px-6 pt-7 pb-5">
          <div>
            <p
              className="font-serif text-white leading-none"
              style={{ fontSize: "17px", letterSpacing: "-0.01em" }}
            >
              Trust Tai
            </p>
            <p
              className="text-[10px] font-semibold tracking-[0.18em] uppercase mt-0.5"
              style={{ color: "#C29A5B" }}
            >
              Studio
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1 text-white/50 hover:text-white transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Top divider */}
        <div className="mx-6 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

        {/* Nav */}
        <nav className="flex-1 px-3 pt-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const count = item.badgeKey ? badges[item.badgeKey] : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors relative group"
                style={{
                  backgroundColor: active ? "#1A2740" : "transparent",
                  color: active ? "#FFFFFF" : "rgba(212,208,200,0.7)",
                }}
              >
                {/* Gold left accent on active */}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ backgroundColor: "#C29A5B" }}
                  />
                )}
                <Icon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: active ? "#FFFFFF" : "rgba(212,208,200,0.55)" }}
                />
                <span className="flex-1 truncate font-medium">{item.label}</span>
                {count > 0 && (
                  <span
                    className="text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#2F62D8", color: "#FFFFFF" }}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-3 pb-5 mt-2">
          <div
            className="mx-3 border-t mb-3"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          />
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors"
            style={{
              backgroundColor: pathname === "/settings" ? "#1A2740" : "transparent",
              color: pathname === "/settings" ? "#FFFFFF" : "rgba(212,208,200,0.55)",
            }}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Settings</span>
          </Link>

          {/* User row */}
          <div className="flex items-center gap-3 px-3 py-2.5 mt-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{
                border: "1.5px solid #C29A5B",
                color: "#C29A5B",
                backgroundColor: "transparent",
              }}
            >
              TS
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">Tai Shobajo</p>
              <p className="text-[11px] truncate" style={{ color: "rgba(212,208,200,0.45)" }}>
                Founder and final approver
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
