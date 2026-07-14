import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { Layout, brand, styles } from './_brand'
import type { TemplateEntry } from './registry'

export interface CostOverrunAutopauseProps {
  projectName: string
  projectId: string
  spendCents: number
  budgetCents: number
  reason: string
  pausedAt: string // ISO
  costGuardUrl?: string
  slackNotified?: boolean
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const kv: React.CSSProperties = {
  ...styles.text,
  margin: '0 0 6px',
  fontSize: '13px',
  color: brand.inkSoft,
}

const Email = ({
  projectName,
  projectId,
  spendCents,
  budgetCents,
  reason,
  pausedAt,
  costGuardUrl = 'https://trusttai.com/admin/cost-guard',
  slackNotified = false,
}: CostOverrunAutopauseProps) => {
  const overage = spendCents - budgetCents
  const pct = budgetCents > 0 ? Math.round((spendCents / budgetCents) * 100) : 0
  return (
    <Layout
      preview={`Cost cap tripped — ${projectName} auto-paused`}
      eyebrow="Cost Guard · Auto-pause"
    >
      <Text style={styles.h1}>Project auto-paused for cost overrun</Text>
      <Text style={styles.text}>
        <strong>{projectName}</strong> exceeded its monthly agent-spend budget and
        was auto-paused by the cost guard. No further agent work will run on this
        project until a separate approver reviews and resumes it.
      </Text>

      <Text style={{ ...kv, marginTop: '16px' }}>
        <strong>Project:</strong> {projectName}
      </Text>
      <Text style={kv}>
        <strong>Project ID:</strong> {projectId}
      </Text>
      <Text style={kv}>
        <strong>Month-to-date spend:</strong> {fmtUsd(spendCents)} ({pct}% of budget)
      </Text>
      <Text style={kv}>
        <strong>Monthly budget:</strong> {fmtUsd(budgetCents)}
      </Text>
      <Text style={kv}>
        <strong>Overage:</strong> {fmtUsd(overage)}
      </Text>
      <Text style={kv}>
        <strong>Paused at:</strong> {new Date(pausedAt).toUTCString()}
      </Text>
      <Text style={{ ...kv, marginBottom: '16px' }}>
        <strong>Reason:</strong> {reason}
      </Text>

      <Text style={styles.buttonWrap}>
        <Button style={styles.button} href={costGuardUrl}>
          Open Cost Guard
        </Button>
      </Text>

      <Text style={{ ...styles.text, fontSize: '12px', color: brand.muted }}>
        {slackNotified
          ? 'A Slack alert was also posted to the ops channel.'
          : 'Slack webhook is not configured; this email is the only alert.'}
        {' '}Resume requires a separate approver from the actor on the last cost row.
      </Text>
    </Layout>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, unknown>) =>
    `[Cost Guard] ${(d.projectName as string) ?? 'Project'} auto-paused for overrun`,
  displayName: 'Cost overrun auto-pause',
  previewData: {
    projectName: 'Acme Inc.',
    projectId: '00000000-0000-0000-0000-000000000000',
    spendCents: 125000,
    budgetCents: 100000,
    reason: 'Month-to-date spend $1,250.00 exceeded budget $1,000.00',
    pausedAt: new Date().toISOString(),
    slackNotified: false,
  } satisfies CostOverrunAutopauseProps,
} satisfies TemplateEntry

export default Email
