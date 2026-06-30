import * as React from 'react'
import { Text } from '@react-email/components'
import { Layout, styles } from './_brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Layout preview="Your verification code" eyebrow="Verification">
    <Text style={styles.h1}>Confirm it's you</Text>
    <Text style={styles.text}>
      Enter this code to verify your identity. It expires shortly.
    </Text>
    <Text style={styles.code}>{token}</Text>
    <Text style={styles.text}>
      If you didn't request this, ignore the email. No changes will be made.
    </Text>
  </Layout>
)

export default ReauthenticationEmail
