import * as React from "react";
import { Button, Hr, Text } from "@react-email/components";
import { Layout, brand, styles } from "./_brand";
import type { TemplateEntry } from "./registry";

export interface IntakeSubmissionOperatorAlertProps {
  founderName: string;
  business?: string | null;
  founderEmail: string;
  website?: string | null;
  timeline?: string | null;
  role?: string | null;
  replyPreference?: string | null;
  submittedAt: string;
  reviewUrl: string;
  queueUrl: string;
  attachmentCount?: number;
}

const meta: React.CSSProperties = {
  fontFamily: brand.sans,
  fontSize: "13px",
  lineHeight: "1.5",
  color: brand.inkSoft,
  margin: "0 0 4px",
};

const Email = ({
  founderName,
  business,
  founderEmail,
  website,
  timeline,
  role,
  replyPreference,
  submittedAt,
  reviewUrl,
  queueUrl,
  attachmentCount = 0,
}: IntakeSubmissionOperatorAlertProps) => {
  const heading = business
    ? `${founderName} · ${business}`
    : founderName;
  return (
    <Layout
      preview={`New roadmap intake from ${founderName}${business ? ` · ${business}` : ""}`}
      eyebrow="New intake submitted"
    >
      <Text style={styles.h1}>New roadmap intake</Text>
      <Text style={styles.text}>
        A new Build-My-Roadmap intake just came in and is waiting in the ops
        review queue.
      </Text>

      <Text style={{ ...styles.text, margin: "16px 0 6px", fontWeight: 600 }}>
        {heading}
      </Text>
      <Text style={meta}>Email: {founderEmail}</Text>
      {website ? <Text style={meta}>Website: {website}</Text> : null}
      {role ? <Text style={meta}>Role: {role}</Text> : null}
      {timeline ? <Text style={meta}>Timeline: {timeline}</Text> : null}
      {replyPreference ? (
        <Text style={meta}>Reply preference: {replyPreference}</Text>
      ) : null}
      {attachmentCount > 0 ? (
        <Text style={meta}>
          Attachments: {attachmentCount} file{attachmentCount === 1 ? "" : "s"}
        </Text>
      ) : null}
      <Text style={meta}>Submitted: {submittedAt}</Text>

      <Hr style={{ borderColor: brand.rule, margin: "20px 0" }} />

      <Text style={styles.buttonWrap}>
        <Button style={styles.button} href={reviewUrl}>
          Open this submission
        </Button>
      </Text>
      <Text style={{ ...styles.text, textAlign: "center", margin: "0" }}>
        Or{" "}
        <a href={queueUrl} style={{ color: brand.royal }}>
          view the full review queue
        </a>
        .
      </Text>
    </Layout>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) => {
    const name = String(data.founderName ?? "someone");
    const biz = data.business ? ` · ${String(data.business)}` : "";
    return `New roadmap intake: ${name}${biz}`;
  },
  displayName: "Intake submitted (operator alert)",
  previewData: {
    founderName: "Jane Founder",
    business: "Acme Co",
    founderEmail: "jane@acme.co",
    website: "https://acme.co",
    timeline: "Next 30 days",
    role: "CEO",
    replyPreference: "Email",
    submittedAt: new Date().toISOString(),
    reviewUrl: "https://trusttai.com/ops/submissions/00000000-0000-0000-0000-000000000000",
    queueUrl: "https://trusttai.com/ops/queue",
    attachmentCount: 2,
  } satisfies IntakeSubmissionOperatorAlertProps,
} satisfies TemplateEntry;

export default Email;
