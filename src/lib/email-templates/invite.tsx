import * as React from 'react'
import { Button, Link, Text } from '@react-email/components'
import { Layout, styles } from './_brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Layout
    preview={`You've been invited to join ${siteName}`}
    eyebrow="Invitation"
  >
    <Text style={styles.h1}>You're invited</Text>
    <Text style={styles.text}>
      You've been invited to join{' '}
      <Link href={siteUrl} style={styles.link}>
        {siteName}
      </Link>
      . Accept below to set up your account and pick up where the work begins.
    </Text>
    <Text style={styles.buttonWrap}>
      <Button style={styles.button} href={confirmationUrl}>
        Accept invitation
      </Button>
    </Text>
    <Text style={styles.text}>
      Not expecting this? You can ignore it. The invitation won't activate
      until accepted from this inbox.
    </Text>
  </Layout>
)

export default InviteEmail
