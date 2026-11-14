// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { SpotComparisonPanel } from './SpotComparisonPanel'
import type { SpotComparison } from './spotComparison'
it('switches A/B without changing the comparison period and exposes the tradeoff', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div'),
    root = createRoot(host)
  const onSelect = vi.fn(),
    onClose = vi.fn()
  const comparison = {
    here: { spot: { both_pct: 20, longest_dark_hours: 10 } },
    best: { spot: { both_pct: 60, longest_dark_hours: 30 } },
    hours: 48,
    gainedHours: 19.2,
    shorterNightHours: -20,
    distanceKm: 2,
  } as SpotComparison
  const render = (selected: 'A' | 'B') =>
    act(() =>
      root.render(
        <SpotComparisonPanel
          comparison={comparison}
          selected={selected}
          onSelect={onSelect}
          onClose={onClose}
        />,
      ),
    )
  try {
    render('A')
    expect(host.textContent).toContain('20.0 h longer longest night')
    expect(host.textContent).toContain('Whole period · 48.0 h')
    const buttons = host.querySelectorAll('.mc-compare-picks button')
    act(() => (buttons[1] as HTMLButtonElement).click())
    expect(onSelect).toHaveBeenCalledWith('B')
    render('B')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
    act(() =>
      host
        .querySelector('header button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  } finally {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  }
})
