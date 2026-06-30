import * as React from 'react'
import { Button, Link, Text } from '@react-email/components'
import { Layout, styles } from './_brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Layout preview={`Confirm your email for ${siteName}`} eyebrow="Welcome">
    <Text style={styles.h1}>Confirm your email</Text>
    <Text style={styles.text}>
      Thanks for joining{' '}
      <Link href={siteUrl} style={styles.link}>
        {siteName}
      </Link>
      . Please confirm{' '}
      <Link href={`mailto:${recipient}`} style={styles.link}>
        {recipient}
      </Link>{' '}
      so we can keep your roadmap, drafts, and replies tied to the right
      inbox.
    </Text>
    <Text style={styles.buttonWrap}>
      <Button style={styles.button} href={confirmationUrl}>
        Confirm email
      </Button>
    </Text>
    <Text style={styles.text}>
      If you didn't start this, you can safely ignore the message. Nothing
      will be created.
    </Text>
  </Layout>
)

export default SignupEmail
