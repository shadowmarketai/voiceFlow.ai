/**
 * BillingPage — redirect stub.
 *
 * VoiceFlow AI is a prepaid-wallet platform. Monthly subscription plans
 * were removed; this route now redirects to the Wallet page so any old
 * bookmarks keep working.
 */

import { Navigate } from 'react-router-dom'

export default function BillingPage() {
  return <Navigate to="/voice/wallet" replace />
}
