import { createServerFn } from "@tanstack/react-start";

/** Public read of dynamically published insights. Server-only data access. */
export const listPublishedInsights = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { listPublishedInsightsServer } = await import("./published.server");
    return await listPublishedInsightsServer();
  } catch (error) {
    console.error("[insights] published list unavailable", error);
    return [];
  }
});

export const getPublishedInsight = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: String(input.slug) }))
  .handler(async ({ data }) => {
    try {
      const { getPublishedInsightServer } = await import("./published.server");
      return await getPublishedInsightServer(data.slug);
    } catch (error) {
      console.error("[insights] published article unavailable", error);
      return null;
    }
  });
