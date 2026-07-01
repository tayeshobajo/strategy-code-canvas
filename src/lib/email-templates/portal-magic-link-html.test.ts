import { afterEach, describe, expect, it } from "vitest";
import {
  renderPortalMagicLinkHtml,
  renderPortalMagicLinkText,
} from "./portal-magic-link-html";

const originalEnv = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalEnv;
});

describe("renderPortalMagicLinkHtml", () => {
  it("uses trusttai.com for the logo when PUBLIC_SITE_URL is unset", () => {
    delete process.env.PUBLIC_SITE_URL;
    const html = renderPortalMagicLinkHtml({ actionLink: "https://x/y" });
    expect(html).toContain('src="https://trusttai.com/__l5e/');
    expect(html).not.toContain("trust-tai.com");
    expect(html).not.toContain("new.trusttai.com");
  });

  it("uses PUBLIC_SITE_URL for the logo when set", () => {
    process.env.PUBLIC_SITE_URL = "https://staging.trusttai.com";
    const html = renderPortalMagicLinkHtml({ actionLink: "https://x/y" });
    expect(html).toContain('src="https://staging.trusttai.com/__l5e/');
  });

  it("honors explicit siteUrl override", () => {
    const html = renderPortalMagicLinkHtml({
      actionLink: "https://x/y",
      siteUrl: "https://preview.example.com",
    });
    expect(html).toContain('src="https://preview.example.com/__l5e/');
  });

  it("escapes the action link", () => {
    const html = renderPortalMagicLinkHtml({
      actionLink: 'https://x/y?a="&b=<c>',
    });
    expect(html).not.toContain('a="&b=<c>');
    expect(html).toContain("&amp;b=&lt;c&gt;");
  });
});

describe("renderPortalMagicLinkText", () => {
  it("contains the action link and canonical contact email", () => {
    const t = renderPortalMagicLinkText("https://x/y");
    expect(t).toContain("https://x/y");
    expect(t).toContain("hello@trusttai.com");
  });
});
