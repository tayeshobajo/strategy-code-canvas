import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { Layout, styles } from './_brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Layout preview={`Your sign-in link for ${siteName}`} eyebrow="Sign in">
    <Text style={styles.h1}>Your sign-in link</Text>
    <Text style={styles.text}>
      Use the link below to open {siteName}. It works once and expires
      shortly, so keep this email private.
    </Text>
    <Text style={styles.buttonWrap}>
      <Button style={styles.button} href={confirmationUrl}>
        Sign in
      </Button>
    </Text>
    <Text style={styles.text}>
      Didn't ask to sign in? You can ignore this. No one can use the link
      without this inbox.
    </Text>
  </Layout>
)

export default MagicLinkEmail
