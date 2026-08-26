import { Alert, Button, Code, Group, Modal, Stack, Text } from '@mantine/core'
import { IconCopy, IconExternalLink } from '@tabler/icons-react'
import { useState } from 'react'
import classes from './chart-report-evidence-links.module.css'

export type ChartReportEvidenceLabels = {
  readonly cancel: string
  readonly copied: string
  readonly copy: string
  readonly copyUnavailable: string
  readonly description: string
  readonly domain: string
  readonly invalid: string
  readonly leave: string
  readonly none: string
  readonly open: string
  readonly url: string
  readonly warningDescription: string
  readonly warningTitle: string
}

export type ParsedChartReportEvidenceUrl = {
  readonly canonicalHref: string
  readonly hostname: string
  readonly submittedUrl: string
}

export const parseChartReportEvidenceUrl = (submittedUrl: string): ParsedChartReportEvidenceUrl | null => {
  try {
    const parsed = new URL(submittedUrl)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname.length === 0) return null
    return {
      canonicalHref: parsed.href,
      hostname: parsed.hostname,
      submittedUrl,
    }
  } catch {
    return null
  }
}

type CopyStatus = {
  readonly index: number
  readonly status: 'copied' | 'unavailable'
} | null

export const ChartReportEvidenceLinks = ({
  labels,
  urls,
}: {
  readonly labels: ChartReportEvidenceLabels
  readonly urls: readonly string[]
}) => {
  const [selected, setSelected] = useState<ParsedChartReportEvidenceUrl | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null)

  const copyExactUrl = async (submittedUrl: string, index: number) => {
    setCopyStatus(null)
    try {
      const writeText = globalThis.navigator?.clipboard?.writeText
      if (!writeText) throw new Error('Clipboard unavailable')
      await writeText.call(globalThis.navigator.clipboard, submittedUrl)
      setCopyStatus({ index, status: 'copied' })
    } catch {
      setCopyStatus({ index, status: 'unavailable' })
    }
  }

  if (urls.length === 0) return <Text c="dimmed">{labels.none}</Text>

  return (
    <>
      <Stack gap="sm">
        <Text className={classes.description} c="dimmed" size="sm">
          {labels.description}
        </Text>
        <ul className={classes.list}>
          {urls.map((submittedUrl, index) => {
            const parsed = parseChartReportEvidenceUrl(submittedUrl)
            const status = copyStatus?.index === index ? copyStatus.status : null
            return (
              <li className={classes.item} key={`${index}:${submittedUrl}`}>
                <Stack gap="sm">
                  <dl className={classes.descriptionList}>
                    <dt>{labels.domain}</dt>
                    <dd>{parsed ? <Code>{parsed.hostname}</Code> : <Text c="red">{labels.invalid}</Text>}</dd>
                    <dt>{labels.url}</dt>
                    <dd>
                      <Code className={classes.exactUrl}>{submittedUrl}</Code>
                    </dd>
                  </dl>
                  <Group gap="sm" wrap="wrap">
                    <Button
                      className={classes.action}
                      leftSection={<IconCopy aria-hidden size={16} />}
                      onClick={() => void copyExactUrl(submittedUrl, index)}
                      size="md"
                      variant="default"
                    >
                      {labels.copy}
                    </Button>
                    {parsed ? (
                      <Button
                        className={classes.action}
                        leftSection={<IconExternalLink aria-hidden size={16} />}
                        onClick={() => setSelected(parsed)}
                        size="md"
                        variant="light"
                      >
                        {labels.open}
                      </Button>
                    ) : null}
                  </Group>
                  {status ? (
                    <Text aria-live="polite" c={status === 'copied' ? 'green' : 'orange'} component="output" size="sm">
                      {status === 'copied' ? labels.copied : labels.copyUnavailable}
                    </Text>
                  ) : null}
                </Stack>
              </li>
            )
          })}
        </ul>
      </Stack>

      <Modal
        centered
        closeButtonProps={{ 'aria-label': labels.cancel }}
        onClose={() => setSelected(null)}
        opened={selected !== null}
        title={labels.warningTitle}
      >
        {selected ? (
          <Stack gap="md">
            <Alert color="orange" role="note">
              <Text className={classes.description} size="sm">
                {labels.warningDescription}
              </Text>
            </Alert>
            <dl className={classes.descriptionList}>
              <dt>{labels.domain}</dt>
              <dd>
                <Code>{selected.hostname}</Code>
              </dd>
              <dt>{labels.url}</dt>
              <dd>
                <Code className={classes.exactUrl}>{selected.submittedUrl}</Code>
              </dd>
            </dl>
            <Group justify="flex-end" wrap="wrap">
              <Button className={classes.action} onClick={() => setSelected(null)} size="md" variant="default">
                {labels.cancel}
              </Button>
              <Button
                className={classes.action}
                component="a"
                href={selected.canonicalHref}
                leftSection={<IconExternalLink aria-hidden size={16} />}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                size="md"
                target="_blank"
              >
                {labels.leave}
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </>
  )
}