import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { Layout, styles } from './_brand'
import type { TemplateEntry } from './registry'

interface AdminAccessGrantedProps {
  recipientName?: string
  grantedByName?: string
  adminDashboardUrl?: string
}

const bullet: React.CSSProperties = {
  ...styles.text,
  margin: '0 0 8px',
  paddingLeft: '18px',
  position: 'relative',
}

const Email = ({
  recipientName,
  grantedByName,
  adminDashboardUrl = 'https://trusttai.com/admin',
}: AdminAccessGrantedProps) => {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,'
  const grantedLine = grantedByName
    ? `${grantedByName} enabled admin access on your Trust Tai account.`
    : 'Your Trust Tai account now has admin access.'
  return (
    <Layout
      preview="Your Trust Tai admin access is active."
      eyebrow="Admin access"
    >
      <Text style={styles.h1}>Admin access enabled</Text>
      <Text style={styles.text}>{greeting}</Text>
      <Text style={styles.text}>{grantedLine} You can sign in and start managing the workspace whenever you're ready.</Text>

      <Text style={{ ...styles.text, margin: '0 0 10px', fontWeight: 600 }}>
        What you can do now
      </Text>
      <Text style={bullet}>• Manage client portals and roadmaps</Text>
      <Text style={bullet}>• Review activity, files, and messages</Text>
      <Text style={bullet}>• Grant or revoke roles for other teammates</Text>
      <Text style={{ ...bullet, margin: '0 0 20px' }}>• Access billing and delivery tools</Text>

      <Text style={styles.buttonWrap}>
        <Button style={styles.button} href={adminDashboardUrl}>
          Open admin dashboard
        </Button>
      </Text>

      <Text style={styles.text}>
        If you didn't expect this, reply to this email and we'll investigate right away.
      </Text>
    </Layout>
  )
}

export const template = {
  component: Email,
  subject: 'You now have admin access to Trust Tai',
  displayName: 'Admin access enabled',
  previewData: {
    recipientName: 'Tai',
    grantedByName: 'Trust Tai system',
    adminDashboardUrl: 'https://trusttai.com/admin',
  } satisfies AdminAccessGrantedProps,
} satisfies TemplateEntry

export default Email
