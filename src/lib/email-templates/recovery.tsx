import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { Layout, styles } from './_brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Layout
    preview={`Reset your password for ${siteName}`}
    eyebrow="Password reset"
  >
    <Text style={styles.h1}>Reset your password</Text>
    <Text style={styles.text}>
      We received a request to reset the password for your {siteName}{' '}
      account. Choose a new one with the link below.
    </Text>
    <Text style={styles.buttonWrap}>
      <Button style={styles.button} href={confirmationUrl}>
        Choose a new password
      </Button>
    </Text>
    <Text style={styles.text}>
      If this wasn't you, ignore this email. Your password stays the same
      until a new one is set.
    </Text>
  </Layout>
)

export default RecoveryEmail
