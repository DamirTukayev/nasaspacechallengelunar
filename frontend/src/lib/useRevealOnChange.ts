import { useEffect, useRef } from 'react'

/**
 * True when an element starting at `top` (px from the viewport top) is effectively off screen:
 * scrolled past, or starting in the bottom quarter where nothing of it can be read yet.
 */
export function needsReveal(top: number, viewportHeight: number): boolean {
  return top < 0 || top > viewportHeight * 0.75
}

/**
 * Returns a ref; the element it is attached to is scrolled into view whenever `key` changes,
 * if it is off screen.
 *
 * On a phone the result sits below the form, so pressing "Analyze" used to change nothing
 * visible. On a wide screen the result is already beside the form and this does nothing.
 */
export function useRevealOnChange<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  const previous = useRef(key)

  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
    const el = ref.current
    if (!el || !needsReveal(el.getBoundingClientRect().top, window.innerHeight)) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [key])

  return ref
}
