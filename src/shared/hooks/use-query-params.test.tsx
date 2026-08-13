import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { useQueryParams } from '@/shared/hooks/use-query-params'

function Harness() {
  const params = useQueryParams()

  return (
    <div>
      <output data-testid="search-string">{params.searchParams.toString()}</output>
      <output data-testid="q-value">{params.getString('q')}</output>
      <output data-testid="page-value">{params.getNumber('page', 1)}</output>
      <output data-testid="active-value">{String(params.getBoolean('active'))}</output>
      <button type="button" onClick={() => params.setParams({ page: 4, q: 'مادة' })}>
        تطبيق ترشيح
      </button>
      <button type="button" onClick={() => params.setParams({ q: null })}>
        مسح النص
      </button>
      <button type="button" onClick={() => params.setParams({ pageSize: 25 })}>
        تغيير الحجم
      </button>
      <button type="button" onClick={() => params.setParams({ page: 2 }, { replace: true })}>
        استبدال
      </button>
    </div>
  )
}

function renderHarness(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/materials${search ? `?${search}` : ''}`]}>
      <Routes>
        <Route path="/materials" element={<Harness />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('useQueryParams', () => {
  it('reads typed values from the current search params', () => {
    renderHarness('page=3&pageSize=50&active=true&q=مادة')

    expect(screen.getByTestId('search-string').textContent).toContain('page=3')
    expect(screen.getByTestId('q-value').textContent).toBe('مادة')
    expect(screen.getByTestId('page-value').textContent).toBe('3')
    expect(screen.getByTestId('active-value').textContent).toBe('true')
  })

  it('returns fallbacks for missing or malformed values', () => {
    renderHarness('page=abc')

    expect(screen.getByTestId('q-value').textContent).toBe('')
    expect(screen.getByTestId('page-value').textContent).toBe('1')
    expect(screen.getByTestId('active-value').textContent).toBe('false')
  })

  it('writes a patch into the URL and replaces existing keys', () => {
    renderHarness('page=2')

    fireEvent.click(screen.getByRole('button', { name: 'تطبيق ترشيح' }))

    expect(screen.getByTestId('search-string').textContent).toContain('page=4')
    expect(screen.getByTestId('search-string').textContent).toContain(
      'q=' + encodeURIComponent('مادة'),
    )
    expect(screen.getByTestId('search-string').textContent).not.toContain('page=2')
  })

  it('removes keys patched with null', () => {
    renderHarness('page=4&q=مادة')

    fireEvent.click(screen.getByRole('button', { name: 'مسح النص' }))

    expect(screen.getByTestId('search-string').textContent).not.toContain('q=')
    expect(screen.getByTestId('search-string').textContent).toContain('page=4')
  })

  it('keeps unrelated parameters when applying a patch', () => {
    renderHarness('page=4&status=Draft')

    fireEvent.click(screen.getByRole('button', { name: 'تغيير الحجم' }))

    expect(screen.getByTestId('search-string').textContent).toContain('status=Draft')
    expect(screen.getByTestId('search-string').textContent).toContain('page=4')
    expect(screen.getByTestId('search-string').textContent).toContain('pageSize=25')
  })

  it('supports replace navigation so history is not flooded', () => {
    renderHarness('')

    fireEvent.click(screen.getByRole('button', { name: 'استبدال' }))

    expect(screen.getByTestId('search-string').textContent).toContain('page=2')
  })
})
