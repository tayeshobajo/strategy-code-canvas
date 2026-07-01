import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_ORIGIN,
  absoluteUrl,
  getPublicSiteUrl,
  isLegacyHost,
} from "./site-url";

const originalEnv = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalEnv;
});

describe("getPublicSiteUrl", () => {
  it("returns trusttai.com when PUBLIC_SITE_URL is unset", () => {
    delete process.env.PUBLIC_SITE_URL;
    expect(getPublicSiteUrl()).toBe(CANONICAL_ORIGIN);
  });

  it("uses PUBLIC_SITE_URL when set", () => {
    process.env.PUBLIC_SITE_URL = "https://staging.trusttai.com";
    expect(getPublicSiteUrl()).toBe("https://staging.trusttai.com");
  });

  it("strips trailing slash", () => {
    expect(getPublicSiteUrl({ PUBLIC_SITE_URL: "https://trusttai.com/" })).toBe(
      "https://trusttai.com",
    );
  });

  it("falls back on invalid URL", () => {
    expect(getPublicSiteUrl({ PUBLIC_SITE_URL: "not a url" })).toBe(CANONICAL_ORIGIN);
  });
});

describe("absoluteUrl", () => {
  it("prepends site URL", () => {
    delete process.env.PUBLIC_SITE_URL;
    expect(absoluteUrl("/portal")).toBe("https://trusttai.com/portal");
    expect(absoluteUrl("portal")).toBe("https://trusttai.com/portal");
  });
  it("respects PUBLIC_SITE_URL override", () => {
    expect(absoluteUrl("/sitemap.xml", { PUBLIC_SITE_URL: "https://x.trusttai.com" })).toBe(
      "https://x.trusttai.com/sitemap.xml",
    );
  });
});

describe("isLegacyHost", () => {
  it.each(["trust-tai.com", "www.trust-tai.com", "new.trusttai.com", "www.trusttai.com"])(
    "flags %s",
    (h) => expect(isLegacyHost(h)).toBe(true),
  );
  it("does not flag canonical host", () => {
    expect(isLegacyHost("trusttai.com")).toBe(false);
  });
  it("ignores lovable preview hosts", () => {
    expect(isLegacyHost("id-preview--abc.lovable.app")).toBe(false);
  });
});
