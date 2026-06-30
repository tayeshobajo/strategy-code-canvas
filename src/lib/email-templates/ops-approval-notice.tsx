import * as React from "react";
import { Hr, Section, Text } from "@react-email/components";
import { Layout, brand, styles } from "./_brand";
import type { DraftContent } from "@/lib/ops/intake-types";

const sectionLabel: Record<keyof DraftContent, string> = {
  situation_summary: "Situation summary",
  core_constraint: "Core constraint",
  strategic_diagnosis: "Strategic diagnosis",
  first_moves: "First moves",
  ninety_day_sequence: "90-day sequence",
  risks: "Risks",
  recommended_engagement: "Recommended engagement",
  next_step: "Next step",
};

const sectionOrder: ReadonlyArray<keyof DraftContent> = [
  "situation_summary",
  "core_constraint",
  "strategic_diagnosis",
  "first_moves",
  "ninety_day_sequence",
  "risks",
  "recommended_engagement",
  "next_step",
];

const fact = (style?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: brand.sans,
  fontSize: "13px",
  lineHeight: "1.5",
  color: brand.inkSoft,
  margin: "0 0 4px",
  ...style,
});

export interface OpsApprovalNoticeProps {
  founderName: string;
  business?: string | null;
  founderEmail: string;
  website?: string | null;
  consoleUrl: string;
  draft: Partial<DraftContent>;
  reviewedBy: string;
  decidedAt: string;
}

export function OpsApprovalNotice({
  founderName,
  business,
  founderEmail,
  website,
  consoleUrl,
  draft,
  reviewedBy,
  decidedAt,
}: OpsApprovalNoticeProps) {
  return (
    <Layout
      preview={`Roadmap approved for ${founderName}${business ? ` · ${business}` : ""}`}
      eyebrow="Approved · ready to send"
    >
      <Text style={{ ...styles.h1, fontSize: "26px", margin: "0 0 14px" }}>
        Roadmap approved for {founderName}
      </Text>
      <Text style={styles.text}>
        You marked this roadmap approved on{" "}
        {new Date(decidedAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        . Nothing has been sent to the founder. Use the final copy below when you write the
        delivery message.
      </Text>

      <Section
        style={{
          backgroundColor: brand.white,
          border: `1px solid ${brand.rule}`,
          borderRadius: "10px",
          padding: "16px 18px",
          margin: "0 0 20px",
        }}
      >
        <Text style={fact({ color: brand.ink, fontWeight: 600 })}>{founderName}</Text>
        {business ? <Text style={fact()}>{business}</Text> : null}
        <Text style={fact()}>{founderEmail}</Text>
        {website ? <Text style={fact()}>{website}</Text> : null}
        <Text style={fact({ color: brand.muted, marginTop: "8px" })}>
          Reviewed by {reviewedBy}
        </Text>
      </Section>

      <Text style={styles.eyebrow}>Final roadmap</Text>

      {sectionOrder.map((key) => {
        const value = (draft?.[key] ?? "").trim();
        if (!value) return null;
        return (
          <Section key={key} style={{ margin: "0 0 18px" }}>
            <Text
              style={{
                fontFamily: brand.display,
                fontSize: "18px",
                color: brand.ink,
                fontWeight: 500,
                margin: "0 0 6px",
                letterSpacing: "-0.01em",
              }}
            >
              {sectionLabel[key]}
            </Text>
            <Text
              style={{
                ...styles.text,
                margin: 0,
                whiteSpace: "pre-wrap" as const,
                color: brand.ink,
              }}
            >
              {value}
            </Text>
          </Section>
        );
      })}

      <Hr style={styles.divider} />
      <Text style={styles.text}>
        Open the submission in the console to add notes, revise the draft, or move it back to in
        review.
      </Text>
      <Section style={styles.buttonWrap}>
        <a href={consoleUrl} style={styles.button}>
          Open in console
        </a>
      </Section>
    </Layout>
  );
}

export default OpsApprovalNotice;
