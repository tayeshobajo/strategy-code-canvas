import * as React from 'react'
import { Button, Link, Text } from '@react-email/components'
import { Layout, styles } from './_brand'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address. For the NEW-recipient half of a
  // secure email_change fanout, `email` equals the recipient (NEW), so we
  // render oldEmail to read "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Layout
    preview={`Confirm your email change for ${siteName}`}
    eyebrow="Email change"
  >
    <Text style={styles.h1}>Confirm your new email</Text>
    <Text style={styles.text}>
      We received a request to move your {siteName} account from{' '}
      <Link href={`mailto:${oldEmail}`} style={styles.link}>
        {oldEmail}
      </Link>{' '}
      to{' '}
      <Link href={`mailto:${newEmail}`} style={styles.link}>
        {newEmail}
      </Link>
      . Confirm the change below.
    </Text>
    <Text style={styles.buttonWrap}>
      <Button style={styles.button} href={confirmationUrl}>
        Confirm email change
      </Button>
    </Text>
    <Text style={styles.text}>
      If this wasn't you, ignore this email and secure your account. The
      change won't go through without this confirmation.
    </Text>
  </Layout>
)

export default EmailChangeEmail
