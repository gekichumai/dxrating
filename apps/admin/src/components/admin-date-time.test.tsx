import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminDateTime } from './admin-date-time'

describe('administrator date and time', () => {
  it('presents the same instant as explicit local and UTC time elements', () => {
    render(
      <AdminDateTime labels={{ local: 'Local time', utc: 'UTC' }} locale="en-US" value="2026-08-24T10:11:12.000Z" />,
    )

    expect(screen.getByText(/Local time:/).textContent).toContain('Aug')
    expect(screen.getByText(/UTC:/).textContent).toContain('Aug')
    const times = document.querySelectorAll('time')
    expect(times).toHaveLength(2)
    expect([...times].map((time) => time.dateTime)).toEqual(['2026-08-24T10:11:12.000Z', '2026-08-24T10:11:12.000Z'])
  })
})