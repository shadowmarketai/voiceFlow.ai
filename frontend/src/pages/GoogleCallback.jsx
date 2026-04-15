/**
 * GoogleCallback — Handles OAuth redirect from Google.
 * Captures the auth code and sends it back to the opener window.
 */

import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function GoogleCallback() {
  const [params] = useSearchParams()

  useEffect(() => {
    const code = params.get('code')
    const error = params.get('error')

    if (window.opener) {
      window.opener.postMessage(
        { type: 'google-auth', code, error },
        window.location.origin,
      )
      window.close()
    }
  }, [params])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafbfe]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Completing sign-in...</p>
      </div>
    </div>
  )
}
