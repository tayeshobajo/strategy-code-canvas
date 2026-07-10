import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { Layout, brand, styles } from "./_brand";
import type { TemplateEntry } from "./registry";

export interface IntakeClientConfirmationProps {
  name: string;
}

const Email = ({ name }: IntakeClientConfirmationProps) => (
  <Layout
    preview="We received your roadmap submission — someone real will reply within one business day."
    eyebrow="Submission received"
  >
    <Text style={styles.h1}>We got it.</Text>
    <Text style={styles.text}>
      Hi {name},
    </Text>
    <Text style={styles.text}>
      We received your submission. A real person will read it and reply within
      one business day.
    </Text>
    <Hr style={{ borderColor: brand.rule, margin: "20px 0" }} />
    <Text style={{ ...styles.text, margin: 0 }}>— Trust Tai</Text>
  </Layout>
);

export const template = {
  component: Email,
  subject: "We received your Roadmap note",
  displayName: "Intake submitted (client confirmation)",
  previewData: {
    name: "Jane Founder",
  } satisfies IntakeClientConfirmationProps,
} satisfies TemplateEntry;

export default Email;
