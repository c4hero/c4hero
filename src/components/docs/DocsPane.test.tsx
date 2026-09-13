import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

let folderOpen = true
vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: () => (folderOpen ? { name: 'shop' } : null),
}))
vi.mock('@/lib/announce', () => ({ announce: vi.fn() }))

import DocsPane from './DocsPane'
import { useDocsStore, bundleKey } from '@/store/docs'
import { parseDocsBundle } from '@/lib/docs/bundle'
import { parseDSL } from '@/lib/dsl'

const DSL = `
workspace "Shop" {
    !docs docs
    model {
        shop = softwareSystem "Shop" {
            !adrs decisions
        }
    }
}`

function ws() {
  return parseDSL(DSL).workspace
}

beforeEach(() => {
  folderOpen = true
  useDocsStore.setState({
    bundles: {
      [bundleKey('docs', 'docs')]: parseDocsBundle('docs', 'docs', [
        { name: 'overview.md', text: '---\ntype: Documentation\ntitle: Overview\n---\n\n# Overview\n\nSee [the decision](../decisions/0001-use-postgres.md).' },
      ]),
      [bundleKey('adrs', 'decisions')]: parseDocsBundle('adrs', 'decisions', [
        { name: '0001-use-postgres.md', text: '# 1. Use Postgres\n\n## Status\n\nSuperseded by [2. Use Spanner](0002-use-spanner.md)\n\n## Context\n\nOld.' },
        { name: '0002-use-spanner.md', text: '# 2. Use Spanner\n\n## Status\n\nAccepted\n\nSupersedes [1. Use Postgres](0001-use-postgres.md)\n\n## Decision\n\nGo global.' },
      ]),
    },
    loaded: true,
    loading: false,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DocsPane', () => {
  it('explains that docs need a folder when the workspace is not from one', () => {
    folderOpen = false
    render(<DocsPane workspace={ws()} />)
    expect(screen.getByText(/Open this workspace from a folder/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /New doc/ })).toBeNull()
  })

  it('lists the workspace bundle and opens a document', () => {
    render(<DocsPane workspace={ws()} />)
    expect(screen.getByRole('region', { name: 'Documentation' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Decisions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Overview/ }))
    expect(screen.getByRole('article', { name: 'Overview' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    expect(screen.getByRole('region', { name: 'Documentation' })).toBeTruthy()
  })

  it('shows an element\'s ADRs with status, and follows supersedes links', () => {
    render(<DocsPane workspace={ws()} elementId="shop" />)
    const decisions = screen.getByRole('region', { name: 'Decisions' })
    expect(decisions.textContent).toContain('Use Postgres')
    expect(decisions.textContent).toContain('Superseded')
    expect(decisions.textContent).toContain('Accepted')

    fireEvent.click(screen.getByRole('button', { name: /Use Spanner/ }))
    expect(screen.getByRole('article', { name: 'Use Spanner' })).toBeTruthy()
    // "Supersedes" resolves to the sibling record and navigates to it.
    fireEvent.click(screen.getByRole('button', { name: 'Use Postgres' }))
    expect(screen.getByRole('article', { name: 'Use Postgres' })).toBeTruthy()
    // And the body's markdown link to a sibling navigates too.
    fireEvent.click(screen.getByText('2. Use Spanner'))
    expect(screen.getByRole('article', { name: 'Use Spanner' })).toBeTruthy()
  })

  it('tells the user when the DSL names a folder that does not exist', () => {
    useDocsStore.setState({ bundles: { [bundleKey('docs', 'docs')]: null } })
    render(<DocsPane workspace={ws()} />)
    expect(screen.getByRole('note').textContent).toMatch(/docs\/.*doesn't exist yet/)
  })

  it('creates a doc through the store and opens it', async () => {
    const create = vi.fn(async () => {
      useDocsStore.setState((s) => ({
        bundles: {
          ...s.bundles,
          [bundleKey('docs', 'docs')]: parseDocsBundle('docs', 'docs', [
            { name: 'overview.md', text: '# Overview' },
            { name: 'runbook.md', text: '---\ntitle: Runbook\n---\n\n# Runbook\n\nSteps.' },
          ]),
        },
      }))
      return 'docs/runbook.md'
    })
    useDocsStore.setState({ create })
    render(<DocsPane workspace={ws()} />)
    fireEvent.click(screen.getByRole('button', { name: /New doc/ }))
    const form = screen.getByRole('form', { name: 'New doc' })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Runbook' } })
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'On call' } })
    fireEvent.submit(form)
    await waitFor(() => expect(create).toHaveBeenCalledWith('docs', { elementId: undefined }, { title: 'Runbook', description: 'On call' }))
    await waitFor(() => expect(screen.getByRole('article', { name: 'Runbook' })).toBeTruthy())
  })
})
