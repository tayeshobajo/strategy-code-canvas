import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapXml } from "@/lib/sitemap-builder";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const xml = buildSitemapXml();
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
