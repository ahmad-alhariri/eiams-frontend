import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  parseSerialList,
  serialsOfOtherLines,
  serialsOfUnits,
  SerialCaptureField,
} from '@/shared/documents/components/serial-capture-field'

const TOO_LONG = 'S'.repeat(201)

describe('parseSerialList (o098.3)', () => {
  it('splits on newlines, commas and semicolons, trims entries, and keeps inner spaces', () => {
    const result = parseSerialList('  SN-1001 \n SN 1002,SN-1003;SN-1004\n\n , ')
    expect(result.serials).toEqual(['SN-1001', 'SN 1002', 'SN-1003', 'SN-1004'])
    expect(result.rejected).toEqual([])
  })

  it('rejects an over-long serial, an in-list duplicate, and a serial used by another line', () => {
    const result = parseSerialList(
      ['SN-1001', 'sn-1001', TOO_LONG, 'SN-9002', 'SN-1003', 'S'.repeat(200)].join('\n'),
      ['sn-9002'],
    )

    expect(result.serials).toEqual(['SN-1001', 'SN-1003', 'S'.repeat(200)])
    expect(result.rejected).toEqual([
      { value: 'sn-1001', reasonAr: 'مكرر داخل القائمة' },
      { value: TOO_LONG, reasonAr: 'أطول من الحد المسموح (200 حرف)' },
      { value: 'SN-9002', reasonAr: 'مستخدم في بند آخر' },
    ])
  })

  it('returns an empty result for blank input', () => {
    expect(parseSerialList(' \n , ; ')).toEqual({ serials: [], rejected: [] })
  })

  it('collects the serials of every other line of the document', () => {
    expect(serialsOfOtherLines([['SN-1'], ['SN-2', 'SN-3']], 0)).toEqual(['SN-2', 'SN-3'])
    expect(serialsOfOtherLines([['SN-1'], ['SN-2']], 1)).toEqual(['SN-1'])
    expect(serialsOfOtherLines([], 0)).toEqual([])
  })

  it('reads the non-empty serials off a line’s units', () => {
    expect(
      serialsOfUnits([
        { serialNumber: ' SN-1 ' },
        {},
        { serialNumber: '' },
        { serialNumber: 'SN-2' },
      ]),
    ).toEqual(['SN-1', 'SN-2'])
  })
})

describe('SerialCaptureField (o098.3)', () => {
  it('renders the Arabic label, hint, and live summary', () => {
    render(
      <SerialCaptureField
        value=""
        alreadyUsed={[]}
        usedOnThisLine={[]}
        onValueChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('التقاط الأرقام التسلسلية')).toBeInTheDocument()
    expect(screen.getByText('سطر واحد لكل رقم تسلسلي، أو افصل بينها بفاصلة')).toBeInTheDocument()
    expect(
      screen.getByText('تم التقاط ٠ رقماً تسلسلياً، ورُفض ٠').closest('[aria-live]'),
    ).toHaveAttribute('aria-live', 'polite')
  })

  // eiams-frontend-7eqp. The summary is Arabic copy, so its counts follow the
  // app-wide numeral policy (design-tokens.md §11): Arabic-Indic digits. A raw
  // interpolation rendered Latin digits, so one screen could state the same
  // quantity in two glyphs.
  it('renders the summary counts in Arabic-Indic digits, never in Latin ones', () => {
    render(
      <SerialCaptureField
        value={['SN-1001', 'SN-1002', 'sn-1001'].join('\n')}
        alreadyUsed={[]}
        usedOnThisLine={[]}
        onValueChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    const summary = screen.getByText('تم التقاط ٢ رقماً تسلسلياً، ورُفض ١')
    expect(summary).toBeInTheDocument()
    expect(summary).not.toHaveTextContent('2')
    expect(summary).not.toHaveTextContent('1')
  })

  it('lists every rejected serial with its Arabic reason and applies only the accepted ones', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <SerialCaptureField
        value={['SN-1001', 'sn-1001', TOO_LONG, 'SN-9002'].join('\n')}
        alreadyUsed={['SN-9002']}
        usedOnThisLine={[]}
        onValueChange={vi.fn()}
        onApply={onApply}
      />,
    )

    expect(screen.getByText('تم التقاط ١ رقماً تسلسلياً، ورُفض ٣')).toBeInTheDocument()
    expect(screen.getByText('sn-1001: مكرر داخل القائمة')).toBeInTheDocument()
    expect(screen.getByText(`${TOO_LONG}: أطول من الحد المسموح (200 حرف)`)).toBeInTheDocument()
    expect(screen.getByText('SN-9002: مستخدم في بند آخر')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تطبيق على الوحدات' }))
    expect(onApply).toHaveBeenCalledWith({
      serials: ['SN-1001'],
      rejected: [
        { value: 'sn-1001', reasonAr: 'مكرر داخل القائمة' },
        { value: TOO_LONG, reasonAr: 'أطول من الحد المسموح (200 حرف)' },
        { value: 'SN-9002', reasonAr: 'مستخدم في بند آخر' },
      ],
    })
  })

  it('announces the refused serials and their reasons in the same live region', () => {
    render(
      <SerialCaptureField
        value={'SN-1001\n' + TOO_LONG}
        alreadyUsed={[]}
        usedOnThisLine={[]}
        onValueChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(
      screen.getByText(`${TOO_LONG}: أطول من الحد المسموح (200 حرف)`).closest('[aria-live]'),
    ).toHaveAttribute('aria-live', 'polite')
  })

  it('rejects a serial already captured on this row with its own reason', () => {
    const result = parseSerialList('SN-1001', [], ['sn-1001'])

    expect(result.serials).toEqual([])
    expect(result.rejected).toEqual([{ value: 'SN-1001', reasonAr: 'مكرر في هذا البند' }])
  })

  it('reports typed text to the parent and disables the apply action while nothing is accepted', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <SerialCaptureField
        value=""
        alreadyUsed={[]}
        usedOnThisLine={[]}
        onValueChange={onValueChange}
        onApply={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('التقاط الأرقام التسلسلية'), 'SN-1')
    expect(onValueChange).toHaveBeenCalled()

    const applyButton = screen.getByRole('button', { name: 'تطبيق على الوحدات' })
    expect(applyButton).toBeDisabled()
  })

  it('disables the capture controls in read-only mode', () => {
    render(
      <SerialCaptureField
        value="SN-1"
        alreadyUsed={[]}
        usedOnThisLine={[]}
        disabled
        onValueChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('التقاط الأرقام التسلسلية')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'تطبيق على الوحدات' })).toBeDisabled()
  })
})
