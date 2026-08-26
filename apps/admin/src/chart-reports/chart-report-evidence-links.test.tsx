import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ChartReportEvidenceLinks,
  parseChartReportEvidenceUrl,
  type ChartReportEvidenceLabels,
} from './chart-report-evidence-links'

const labels: ChartReportEvidenceLabels = {
  cancel: 'Stay in admin',
  copied: 'Evidence URL copied.',
  copy: 'Copy URL',
  copyUnavailable: 'Clipboard unavailable; copy manually.',
  description: 'Reporter links are untrusted and never previewed.',
  domain: 'Canonical domain',
  invalid: 'Unsupported evidence URL',
  leave: 'Open isolated external page',
  none: 'No source URLs were submitted.',
  open: 'Review before opening',
  url: 'Exact submitted URL',
  warningDescription: 'Review the exact URL before opening without a referrer.',
  warningTitle: 'Leave admin to inspect evidence?',
}

const renderLinks = (urls: readonly string[]) =>
  render(
    <MantineProvider>
      <ChartReportEvidenceLinks labels={labels} urls={urls} />
    </MantineProvider>,
  )

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('chart-report evidence URL boundary', () => {
  it.each([
    ['javascript:alert(1)', null],
    ['data:text/html,<h1>owned</h1>', null],
    ['file:///etc/passwd', null],
    ['not a URL', null],
    ['https://trusted.example@evil.example/evidence', 'evil.example'],
    ['https://例え.テスト/path', 'xn--r8jz45g.xn--zckzah'],
  ] as const)('reparses %s with an HTTP(S)-only canonical hostname result', (value, hostname) => {
    expect(parseChartReportEvidenceUrl(value)?.hostname ?? null).toBe(hostname)
  })

  it('keeps reporter URLs inert until a warning and emits only the isolated final anchor', async () => {
    const user = userEvent.setup()
    const deceptive = 'https://trusted.example@evil.example/evidence?q=exact'
    const { container } = renderLinks([deceptive])

    expect(screen.getByText('evil.example')).toBeTruthy()
    expect(screen.getByText(deceptive)).toBeTruthy()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('iframe, img, video, audio, object, embed')).toBeNull()

    await user.click(screen.getByRole('button', { name: labels.open }))
    const dialog = await screen.findByRole('dialog', {
      name: labels.warningTitle,
    })
    expect(within(dialog).getByText('evil.example')).toBeTruthy()
    expect(within(dialog).getByText(deceptive)).toBeTruthy()
    const finalLink = within(dialog).getByRole('link', { name: labels.leave })
    expect(finalLink.getAttribute('href')).toBe(deceptive)
    expect(finalLink.getAttribute('target')).toBe('_blank')
    expect(finalLink.getAttribute('rel')).toBe('noopener noreferrer')
    expect(finalLink.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('renders malicious schemes as inert exact text with no open control', () => {
    const malicious = 'javascript:alert(document.cookie)'
    const { container } = renderLinks([malicious])

    expect(screen.getByText(malicious)).toBeTruthy()
    expect(screen.getByText(labels.invalid)).toBeTruthy()
    expect(screen.queryByRole('button', { name: labels.open })).toBeNull()
    expect(container.querySelector('a, iframe, img, object, embed')).toBeNull()
  })

  it('copies the exact submitted string without canonical rewriting', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const exact = 'https://EXAMPLE.com:443/a%2Fb?x=%2F'
    renderLinks([exact])

    fireEvent.click(screen.getByRole('button', { name: labels.copy }))

    expect(await screen.findByText(labels.copied)).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(exact)
  })

  it('fails closed with manual-copy guidance when Clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const exact = 'https://evidence.example/item'
    renderLinks([exact])

    fireEvent.click(screen.getByRole('button', { name: labels.copy }))

    expect(await screen.findByText(labels.copyUnavailable)).toBeTruthy()
    expect(screen.getByText(exact)).toBeTruthy()
  })

  it('states when no source evidence was submitted', () => {
    renderLinks([])
    expect(screen.getByText(labels.none)).toBeTruthy()
  })
})