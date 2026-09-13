import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Markdown from './Markdown'

describe('Markdown', () => {
  it('renders inline code, emphasis and strong', () => {
    const { container } = render(<Markdown text={'Use `x` with **bold**, __also__, *em* and _em2_.'} />)
    expect(container.querySelector('code')?.textContent).toBe('x')
    expect([...container.querySelectorAll('strong')].map((e) => e.textContent)).toEqual(['bold', 'also'])
    expect([...container.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['em', 'em2'])
  })

  it('never injects markup: text is rendered as text', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> **<b>bold</b>**'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('opens safe external links in a new tab and drops unsafe schemes', () => {
    const { container } = render(<Markdown text={'[ok](https://example.com/a) [bad](javascript:alert(1)) <https://example.org>'} />)
    const anchors = [...container.querySelectorAll('a')]
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/a', 'https://example.org/'])
    expect(anchors.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBe(true)
    expect(container.textContent).toContain('bad')
  })

  it('hands relative links to the host and renders them as text when unhandled', () => {
    const onRelativeLink = vi.fn((href: string) => href === '0002-b.md')
    const { getByText } = render(<Markdown text={'See [B](0002-b.md) and [C](missing.md).'} onRelativeLink={onRelativeLink} />)
    const b = getByText('B')
    expect(b.tagName).toBe('A')
    fireEvent.click(b)
    expect(onRelativeLink).toHaveBeenCalledWith('0002-b.md')
    const c = getByText('C')
    expect(c.tagName).toBe('A')
  })

  it('renders images as their alt text', () => {
    const { container } = render(<Markdown text={'![diagram](x.png)'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('em')?.textContent).toBe('diagram')
  })

  it('renders block structure: headings, lists, tables, code', () => {
    const { container } = render(<Markdown text={'## H\n\n- a\n  - b\n\n| k | v |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```'} />)
    expect(container.querySelector('h2')?.textContent).toBe('H')
    expect(container.querySelectorAll('ul').length).toBe(2)
    expect(container.querySelector('td')?.textContent).toBe('1')
    expect(container.querySelector('pre code')?.textContent).toBe('code')
  })
})
