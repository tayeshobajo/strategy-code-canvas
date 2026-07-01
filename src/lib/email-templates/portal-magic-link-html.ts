// Premium branded HTML for the portal magic-link email.
// Mirrors the tokens in src/lib/email-templates/_brand.tsx so this email
// matches the rest of the Trust Tai transactional look.

const brand = {
  ink: "#171c38",
  inkSoft: "#3a3f5c",
  royal: "#3a4fcf",
  paper: "#fbfaf5",
  rule: "#e3e4ea",
  muted: "#6f7585",
  white: "#ffffff",
  display: `'Cormorant Garamond', Georgia, 'Times New Roman', serif`,
  sans: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`,
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PortalMagicLinkOptions {
  actionLink: string;
  /** Copy shown under the H1. */
  intro?: string;
  /** Optional short preview (inbox preheader). */
  preview?: string;
  /** Eyebrow label above the H1. */
  eyebrow?: string;
  /** H1 headline. */
  heading?: string;
  /** Button label. */
  ctaLabel?: string;
}

export function renderPortalMagicLinkHtml(opts: PortalMagicLinkOptions): string {
  const {
    actionLink,
    intro = "Use the secure link below to sign in to your Trust Tai client portal. It expires in 60 minutes.",
    preview = "Your sign-in link for the Trust Tai client portal.",
    eyebrow = "Client portal",
    heading = "Welcome back",
    ctaLabel = "Enter your portal",
  } = opts;

  const safeLink = escapeHtml(actionLink);

  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(heading)}</title>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      body { margin:0; padding:0; background:${brand.white}; }
      a { color:${brand.royal}; }
      .btn:hover { background:${brand.royal} !important; }
      @media (max-width:600px) {
        .shell { border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
        .pad { padding-left:24px !important; padding-right:24px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:32px 16px;background:${brand.white};font-family:${brand.sans};color:${brand.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" class="shell" width="560" cellpadding="0" cellspacing="0" border="0"
            style="max-width:560px;width:100%;background:${brand.paper};border:1px solid ${brand.rule};border-radius:14px;overflow:hidden;">
            <tr>
              <td class="pad" style="padding:28px 36px 0;">
                <span style="font-family:${brand.display};font-size:22px;font-weight:500;letter-spacing:0.02em;color:${brand.ink};">
                  Trust<span style="color:${brand.royal};">Tai</span>
                </span>
                <div style="border-top:1px solid ${brand.rule};margin:20px 0 0;"></div>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:24px 36px 8px;">
                <p style="font-family:${brand.sans};font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${brand.royal};margin:0 0 14px;">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="font-family:${brand.display};font-size:30px;line-height:1.15;font-weight:500;color:${brand.ink};margin:0 0 18px;letter-spacing:-0.01em;">
                  ${escapeHtml(heading)}
                </h1>
                <p style="font-family:${brand.sans};font-size:15px;line-height:1.65;color:${brand.inkSoft};margin:0 0 22px;">
                  ${escapeHtml(intro)}
                </p>
                <p style="margin:8px 0 22px;">
                  <a class="btn" href="${safeLink}"
                    style="display:inline-block;background:${brand.ink};color:${brand.white};font-family:${brand.sans};font-size:14px;font-weight:600;letter-spacing:0.02em;border-radius:999px;padding:14px 28px;text-decoration:none;">
                    ${escapeHtml(ctaLabel)}
                  </a>
                </p>
                <p style="font-family:${brand.sans};font-size:13px;line-height:1.6;color:${brand.muted};margin:0 0 6px;">
                  Trouble with the button? Paste this link into your browser:
                </p>
                <p style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:${brand.inkSoft};word-break:break-all;margin:0 0 18px;">
                  <a href="${safeLink}" style="color:${brand.royal};text-decoration:underline;">${safeLink}</a>
                </p>
                <p style="font-family:${brand.sans};font-size:13px;line-height:1.6;color:${brand.muted};margin:0 0 6px;">
                  If you didn't request this, you can ignore this email. The link works once and only from this inbox.
                </p>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:0 36px 28px;">
                <div style="border-top:1px solid ${brand.rule};margin:24px 0 20px;"></div>
                <p style="font-family:${brand.sans};font-size:12px;line-height:1.6;color:${brand.muted};margin:0;">
                  Sent by Trust Tai · A quieter way to build software.<br/>
                  Questions? Reply to this email or reach
                  <a href="mailto:hello@trusttai.com" style="color:${brand.royal};text-decoration:underline;">hello@trusttai.com</a>.
                </p>
                <p style="font-family:${brand.display};font-size:16px;font-style:italic;color:${brand.ink};margin:8px 0 0;">— Tai</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderPortalMagicLinkText(actionLink: string, intro?: string): string {
  const body = intro ??
    "Use the secure link below to sign in to your Trust Tai client portal. It expires in 60 minutes.";
  return `Welcome back.

${body}

${actionLink}

If you didn't request this, you can ignore this email.

— Tai
Trust Tai · hello@trusttai.com`;
}
