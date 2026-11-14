import { useEffect, useRef } from 'react'

export interface MissionKeyHandlers {
  togglePlay: () => void
  /** Move the cursor by this many samples. */
  step: (samples: number, bigStep: boolean) => void
  /** 0-based site slot from the number keys. */
  pickSite: (slot: number) => void
  toggleFullscreen: () => void
  toggleDemo: () => void
  exit: () => void
}

/** Ignore keys typed into form fields. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  )
}

/** Space, ←/→ (Shift for bigger steps), 1–4, F, D and Esc for Mission Control. */
export function useMissionKeys(handlers: MissionKeyHandlers) {
  // The latest handlers, without re-binding the listener on every render.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      const h = latest.current
      if (event.key === ' ') {
        event.preventDefault()
        h.togglePlay()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        h.step(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey)
      } else if (/^[1-4]$/.test(event.key)) {
        h.pickSite(Number(event.key) - 1)
      } else if (event.key === 'f' || event.key === 'F') {
        h.toggleFullscreen()
      } else if (event.key === 'd' || event.key === 'D') {
        h.toggleDemo()
      } else if (event.key === 'Escape' && !document.fullscreenElement) {
        // In browser fullscreen, Esc first leaves fullscreen (the browser handles that).
        h.exit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
