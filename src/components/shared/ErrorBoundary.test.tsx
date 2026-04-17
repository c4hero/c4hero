import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

vi.mock('lucide-react', () => ({
  RefreshCw: () => null,
  Home: () => null,
}))

function Throwing({ message = 'boom' }: { message?: string }) {
  throw new Error(message)
}

function Ok() {
  return <div data-testid="child">ok</div>
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Suppress React's error logging for cleaner test output
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <Ok />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('child')).toBeTruthy()
  })

  it('renders the error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Something went wrong')).toBeTruthy()
  })

  it('displays the caught error message', () => {
    render(
      <ErrorBoundary>
        <Throwing message="custom failure message" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('custom failure message')).toBeTruthy()
  })

  it('renders a custom label when provided', () => {
    render(
      <ErrorBoundary label="Canvas crashed">
        <Throwing />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Canvas crashed')).toBeTruthy()
  })

  it('does NOT render Go home button when onHome is not provided', () => {
    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('Go home')).toBeNull()
  })

  it('renders Go home button when onHome is provided', () => {
    const onHome = vi.fn()
    render(
      <ErrorBoundary onHome={onHome}>
        <Throwing />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Go home')).toBeTruthy()
  })

  it('clicking Go home calls onHome callback', () => {
    const onHome = vi.fn()
    render(
      <ErrorBoundary onHome={onHome}>
        <Throwing />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('Go home'))
    expect(onHome).toHaveBeenCalledOnce()
  })

  it('clicking Try again calls onReset callback', () => {
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <Throwing />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('Try again'))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('error UI has role="alert" for screen readers', () => {
    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toBeTruthy()
  })

  it('logs the error via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <Throwing message="tracked error" />
      </ErrorBoundary>,
    )
    // ErrorBoundary logs via the logger, which fans out to console.error.
    // The console transport prefixes entries with "[c4hero][ErrorBoundary]".
    const calls = consoleError.mock.calls
    const loggedByBoundary = calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('[c4hero][ErrorBoundary]'),
    )
    expect(loggedByBoundary).toBe(true)
  })
})
