import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useBreakpoint } from './useBreakpoint'

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
}

function BreakpointProbe({ onRender }: { onRender?: (value: string) => void }) {
  const breakpoint = useBreakpoint()
  onRender?.(breakpoint)
  return <div data-testid="breakpoint">{breakpoint}</div>
}

describe('useBreakpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setViewportWidth(1024)
  })

  it('reads the current desktop breakpoint', () => {
    setViewportWidth(1280)
    render(<BreakpointProbe />)
    expect(screen.getByTestId('breakpoint').textContent).toBe('desktop')
  })

  it('updates when resize crosses a breakpoint boundary', () => {
    setViewportWidth(1280)
    render(<BreakpointProbe />)
    expect(screen.getByTestId('breakpoint').textContent).toBe('desktop')

    act(() => {
      setViewportWidth(900)
      window.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByTestId('breakpoint').textContent).toBe('tablet')

    act(() => {
      setViewportWidth(500)
      window.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByTestId('breakpoint').textContent).toBe('mobile')
  })

  it('does not re-render for resizes within the same breakpoint', () => {
    const onRender = vi.fn()
    setViewportWidth(1280)
    render(<BreakpointProbe onRender={onRender} />)
    expect(onRender).toHaveBeenCalledTimes(1)

    act(() => {
      setViewportWidth(1200)
      window.dispatchEvent(new Event('resize'))
    })
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it('removes the resize listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<BreakpointProbe />)

    unmount()

    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
