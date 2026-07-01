import { afterEach, describe, expect, it } from "vitest";
import { buildSitemapXml, SITE_ENTRIES } from "./sitemap-builder";
import { LEGACY_URL_FRAGMENTS } from "./site-url";

const originalEnv = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalEnv;
});

describe("buildSitemapXml", () => {
  it("uses trusttai.com when PUBLIC_SITE_URL is unset", () => {
    delete process.env.PUBLIC_SITE_URL;
    const xml = buildSitemapXml();
    expect(xml).toContain("<loc>https://trusttai.com/</loc>");
    expect(xml).toContain("<loc>https://trusttai.com/build-my-roadmap</loc>");
  });

  it("uses PUBLIC_SITE_URL when set", () => {
    process.env.PUBLIC_SITE_URL = "https://staging.trusttai.com";
    const xml = buildSitemapXml();
    expect(xml).toContain("<loc>https://staging.trusttai.com/about</loc>");
  });

  it("contains every configured route exactly once", () => {
    delete process.env.PUBLIC_SITE_URL;
    const xml = buildSitemapXml();
    for (const e of SITE_ENTRIES) {
      const marker = `<loc>https://trusttai.com${e.path}</loc>`;
      expect(xml.split(marker).length - 1, `missing ${e.path}`).toBe(1);
    }
  });

  it("emits well-formed XML with no legacy domains", () => {
    delete process.env.PUBLIC_SITE_URL;
    const xml = buildSitemapXml();
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect(xml).toContain("</urlset>");
    for (const frag of LEGACY_URL_FRAGMENTS) {
      expect(xml).not.toContain(frag);
    }
  });
});
