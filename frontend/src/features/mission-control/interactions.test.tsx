// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyzeResponse } from '../../api/types'
import { VerdictBadge, VerdictReveal } from './VerdictReveal'
import { useMissionKeys, type MissionKeyHandlers } from './useMissionKeys'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function Controls({ handlers }: { handlers: MissionKeyHandlers }) {
  useMissionKeys(handlers)
  return (
    <div tabIndex={0} data-testid="scene">
      <button>
        <span>Details & settings</span>
      </button>
      <details>
        <summary>Mission metrics</summary>Metrics
      </details>
      <input aria-label="Height" />
      <select aria-label="Quality">
        <option>Auto</option>
      </select>
      <a href="#details">Details</a>
    </div>
  )
}

function key(target: Element, value: string) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

describe('Mission Control keyboard ownership', () => {
  it.each(['button', 'button span', 'summary', 'input', 'select', 'a'])(
    'leaves Space to %s',
    (selector) => {
      const handlers = {
        togglePlay: vi.fn(),
        step: vi.fn(),
        pickSite: vi.fn(),
        toggleFullscreen: vi.fn(),
        toggleDemo: vi.fn(),
        exit: vi.fn(),
      }
      act(() => root.render(<Controls handlers={handlers} />))
      expect(key(host.querySelector(selector)!, ' ').defaultPrevented).toBe(false)
      expect(handlers.togglePlay).not.toHaveBeenCalled()
    },
  )
  it.each(['button', 'button span', 'summary'])(
    'keeps global shortcuts with focus on %s',
    (selector) => {
      const handlers = {
        togglePlay: vi.fn(),
        step: vi.fn(),
        pickSite: vi.fn(),
        toggleFullscreen: vi.fn(),
        toggleDemo: vi.fn(),
        exit: vi.fn(),
      }
      act(() => root.render(<Controls handlers={handlers} />))
      const target = host.querySelector(selector)! as HTMLElement
      target.closest<HTMLElement>('button, summary')!.focus()
      key(target, 'Escape')
      key(target, 'f')
      key(target, 'D')
      key(target, '2')
      key(target, 'ArrowLeft')
      key(target, 'ArrowRight')
      expect(handlers.exit).toHaveBeenCalledTimes(1)
      expect(handlers.toggleFullscreen).toHaveBeenCalledTimes(1)
      expect(handlers.toggleDemo).toHaveBeenCalledTimes(1)
      expect(handlers.pickSite).toHaveBeenCalledWith(1)
      expect(handlers.step.mock.calls).toEqual([
        [-1, false],
        [1, false],
      ])
      expect(key(target, ' ').defaultPrevented).toBe(false)
      expect(key(target, 'Enter').defaultPrevented).toBe(false)
      expect(handlers.togglePlay).not.toHaveBeenCalled()
    },
  )
  it.each(['input', 'select'])('leaves all shortcuts to %s', (selector) => {
    const handlers = {
      togglePlay: vi.fn(),
      step: vi.fn(),
      pickSite: vi.fn(),
      toggleFullscreen: vi.fn(),
      toggleDemo: vi.fn(),
      exit: vi.fn(),
    }
    act(() => root.render(<Controls handlers={handlers} />))
    const target = host.querySelector(selector)! as HTMLElement
    target.focus()
    for (const value of [' ', 'Escape', 'f', 'D', '2', 'ArrowLeft', 'ArrowRight']) {
      expect(key(target, value).defaultPrevented).toBe(false)
    }
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
  })
  it('keeps scene shortcuts and cleans up the listener', () => {
    const handlers = {
      togglePlay: vi.fn(),
      step: vi.fn(),
      pickSite: vi.fn(),
      toggleFullscreen: vi.fn(),
      toggleDemo: vi.fn(),
      exit: vi.fn(),
    }
    act(() => root.render(<Controls handlers={handlers} />))
    const scene = host.querySelector('[data-testid="scene"]')!
    expect(key(scene, ' ').defaultPrevented).toBe(true)
    key(scene, 'ArrowRight')
    key(scene, '2')
    expect(handlers.togglePlay).toHaveBeenCalledTimes(1)
    expect(handlers.step).toHaveBeenCalledWith(1, false)
    expect(handlers.pickSite).toHaveBeenCalledWith(1)
    act(() => root.render(null))
    key(document.body, ' ')
    expect(handlers.togglePlay).toHaveBeenCalledTimes(1)
  })
})

const analysis = {
  metrics: { verdict: 'red', verdict_reasons: ['No direct link'] },
} as AnalyzeResponse
function renderVerdict(visible: boolean, scenario = 'pole') {
  act(() => root.render(<VerdictReveal key={scenario} analysis={analysis} visible={visible} />))
}

describe('Verdict reveal lifetime', () => {
  it('does not restart its deadline when the inspector closes and reopens', () => {
    vi.useFakeTimers()
    renderVerdict(true)
    expect(host.textContent).toContain('Not viable')
    act(() => vi.advanceTimersByTime(2000))
    renderVerdict(false)
    renderVerdict(true)
    act(() => vi.advanceTimersByTime(2500))
    expect(host.textContent).toBe('')
    renderVerdict(false)
    renderVerdict(true)
    expect(host.textContent).toBe('')
  })
  it('expires while the inspector is closed and resets for a new scenario', () => {
    vi.useFakeTimers()
    renderVerdict(false)
    act(() => vi.advanceTimersByTime(4500))
    renderVerdict(true)
    expect(host.textContent).toBe('')
    renderVerdict(true, 'malapert')
    expect(host.textContent).toContain('Not viable')
  })
})

describe('Verdict badge', () => {
  it('shows the verdict in the bottom bar without the inspector and without expiring', () => {
    vi.useFakeTimers()
    act(() => root.render(<VerdictBadge analysis={analysis} />))
    expect(host.textContent).toContain('Not viable')
    expect(host.querySelector('[data-verdict="red"]')).not.toBeNull()
    act(() => vi.advanceTimersByTime(60_000))
    expect(host.textContent).toContain('Not viable')
  })
})
