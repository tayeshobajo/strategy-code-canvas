import { createFileRoute } from "@tanstack/react-router";
import { Folder } from "lucide-react";

export const Route = createFileRoute("/portal/files")({
  head: () => ({
    meta: [
      { title: "Files — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FilesPage,
});

function FilesPage() {
  return (
    <div className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
        <Folder className="w-3.5 h-3.5" /> Files
      </div>
      <h1 className="font-display text-3xl text-ink mt-2">
        Shared files will appear here.
      </h1>
      <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
        Documents, decks, and working files Tai shares with you will land in this
        space. Nothing to show yet.
      </p>
    </div>
  );
}
