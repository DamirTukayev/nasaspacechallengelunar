// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Link } from './Link'

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
  vi.unstubAllGlobals()
})

describe('shared controls preserve native behaviour', () => {
  it('does not submit a surrounding form unless explicitly requested', () => {
    const submit = vi.fn()
    const action = vi.fn()
    act(() =>
      root.render(
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Button onClick={action}>Compare</Button>
          <Button type="submit">Analyze</Button>
        </form>,
      ),
    )
    act(() => host.querySelectorAll('button')[0].click())
    expect(action).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
    act(() => host.querySelectorAll('button')[1].click())
    expect(submit).toHaveBeenCalledOnce()
  })
  it('keeps a disabled action inactive', () => {
    const action = vi.fn()
    act(() =>
      root.render(
        <Button disabled onClick={action}>
          Compare
        </Button>,
      ),
    )
    act(() => host.querySelector('button')!.click())
    expect(action).not.toHaveBeenCalled()
  })
  it('uses an ordinary same-tab anchor for internal navigation', () => {
    act(() =>
      root.render(
        <Link href="/about" variant="nav" aria-current="page">
          About
        </Link>,
      ),
    )
    const link = host.querySelector('a')!
    expect(link.getAttribute('href')).toBe('/about')
    expect(link.hasAttribute('target')).toBe(false)
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(link.querySelector('.ui-external-mark')).toBeNull()
  })
  it('opens an explicitly external link with a protected new tab and a decorative marker', () => {
    act(() =>
      root.render(
        <Link external href="https://github.com" rel="author">
          GitHub
        </Link>,
      ),
    )
    const link = host.querySelector('a')!
    expect(link.target).toBe('_blank')
    expect(link.relList.contains('noopener')).toBe(true)
    expect(link.relList.contains('noreferrer')).toBe(true)
    expect(link.relList.contains('author')).toBe(true)
    expect(link.querySelector('[aria-hidden="true"]')?.textContent).toBe('↗')
  })
})
