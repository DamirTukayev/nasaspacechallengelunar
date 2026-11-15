import { Button } from '../../components/ui/Button'
import { useEffect, useState } from 'react'

const COPIED_MS = 2000

/** Copies the page URL, which always describes what is on screen. */
export function ShareButton() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard access (insecure context, permissions): let the user copy it by hand.
      window.prompt('Copy this link:', url)
    }
  }

  return (
    <Button className="share-button" onClick={copy} title="Copy a link that opens these scenarios">
      <span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span>
    </Button>
  )
}
