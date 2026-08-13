import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebounce } from '@/shared/hooks/use-debounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('مستودع', 300))
    expect(result.current).toBe('مستودع')
  })

  it('updates the value only after the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'أ' },
    })

    rerender({ value: 'أب' })
    expect(result.current).toBe('أ')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('أ')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('أب')
  })

  it('restarts the delay when the value changes repeatedly', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: '' },
    })

    rerender({ value: 'م' })
    rerender({ value: 'مع' })
    rerender({ value: 'مادة' })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('مادة')
  })

  it('uses the documented 300ms default window', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: '1' },
    })

    rerender({ value: '12' })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('1')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('12')
  })

  it('clears the pending timer on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearTimeout')
    const { unmount, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'أ' },
    })

    rerender({ value: 'ب' })
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
