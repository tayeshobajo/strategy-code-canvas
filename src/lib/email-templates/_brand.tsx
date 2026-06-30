import * as React from 'react'
import {
  Body,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

// Trust Tai brand tokens (email-safe hex of styles.css oklch tokens)
export const brand = {
  ink: '#171c38',
  inkSoft: '#3a3f5c',
  royal: '#3a4fcf',
  royalDeep: '#2c3ea8',
  paper: '#fbfaf5',
  rule: '#e3e4ea',
  muted: '#6f7585',
  white: '#ffffff',
  display: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}

export const styles = {
  main: {
    backgroundColor: brand.white,
    fontFamily: brand.sans,
    color: brand.ink,
    margin: 0,
    padding: '32px 16px',
  },
  shell: {
    maxWidth: '560px',
    margin: '0 auto',
    backgroundColor: brand.paper,
    border: `1px solid ${brand.rule}`,
    borderRadius: '14px',
    overflow: 'hidden' as const,
  },
  header: {
    padding: '28px 36px 0',
  },
  wordmark: {
    fontFamily: brand.display,
    fontSize: '22px',
    fontWeight: 500 as const,
    letterSpacing: '0.02em',
    color: brand.ink,
    margin: 0,
  },
  wordmarkAccent: { color: brand.royal },
  hairline: {
    borderTop: `1px solid ${brand.rule}`,
    margin: '20px 0 0',
  },
  body: { padding: '24px 36px 8px' },
  eyebrow: {
    fontFamily: brand.sans,
    fontSize: '11px',
    fontWeight: 600 as const,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: brand.royal,
    margin: '0 0 14px',
  },
  h1: {
    fontFamily: brand.display,
    fontSize: '30px',
    lineHeight: '1.15',
    fontWeight: 500 as const,
    color: brand.ink,
    margin: '0 0 18px',
    letterSpacing: '-0.01em',
  },
  text: {
    fontFamily: brand.sans,
    fontSize: '15px',
    lineHeight: '1.65',
    color: brand.inkSoft,
    margin: '0 0 18px',
  },
  link: {
    color: brand.royal,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  buttonWrap: { padding: '8px 0 6px' },
  button: {
    display: 'inline-block',
    backgroundColor: brand.ink,
    color: brand.white,
    fontFamily: brand.sans,
    fontSize: '14px',
    fontWeight: 600 as const,
    letterSpacing: '0.02em',
    borderRadius: '999px',
    padding: '14px 28px',
    textDecoration: 'none',
  },
  code: {
    display: 'inline-block',
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
    fontSize: '28px',
    letterSpacing: '0.32em',
    fontWeight: 600 as const,
    color: brand.ink,
    backgroundColor: brand.white,
    border: `1px solid ${brand.rule}`,
    borderRadius: '10px',
    padding: '16px 22px',
    margin: '4px 0 22px',
  },
  divider: {
    borderTop: `1px solid ${brand.rule}`,
    margin: '24px 0 20px',
  },
  footer: {
    fontFamily: brand.sans,
    fontSize: '12px',
    lineHeight: '1.6',
    color: brand.muted,
    margin: 0,
  },
  footerBlock: { padding: '0 36px 28px' },
  signature: {
    fontFamily: brand.display,
    fontSize: '16px',
    fontStyle: 'italic' as const,
    color: brand.ink,
    margin: '6px 0 0',
  },
}

interface LayoutProps {
  preview: string
  eyebrow?: string
  children: React.ReactNode
}

export const Layout = ({ preview, eyebrow, children }: LayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <Font
        fontFamily="Inter"
        fallbackFontFamily="Helvetica"
        webFont={{
          url: 'https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTcQrZL.woff2',
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle="normal"
      />
      <Font
        fontFamily="Cormorant Garamond"
        fallbackFontFamily="Georgia"
        webFont={{
          url: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bmX5slCNuHLi8bLeY9MK7whWMhyjornFLsS6V7w.woff2',
          format: 'woff2',
        }}
        fontWeight={500}
        fontStyle="normal"
      />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={styles.main}>
      <Container style={styles.shell}>
        <Section style={styles.header}>
          <Text style={styles.wordmark}>
            Trust<span style={styles.wordmarkAccent}>Tai</span>
          </Text>
          <Hr style={styles.hairline} />
        </Section>
        <Section style={styles.body}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          {children}
        </Section>
        <Section style={styles.footerBlock}>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            Sent by Trust Tai · A quieter way to build software.
            <br />
            Questions? Reply to this email or reach{' '}
            <Link href="mailto:hello@trusttai.com" style={styles.link}>
              hello@trusttai.com
            </Link>
            .
          </Text>
          <Text style={styles.signature}>— Tai</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)
