"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Menu } from "lucide-react";

interface ShellProps {
  children: React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#F4F1EA" }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 min-h-screen md:ml-[280px] min-w-0">
        {/* Mobile top bar */}
        <header
          className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
          style={{ backgroundColor: "#0D1626", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-white/70 hover:text-white transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif text-white text-sm">Trust Tai Studio</span>
        </header>
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
