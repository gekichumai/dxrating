import { Button, IconButton, Tooltip } from '@mui/material'
import clsx from 'clsx'
import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import MdiArrowTopRight from '~icons/mdi/arrow-top-right'
import MdiCheck from '~icons/mdi/check'
import MdiContentCopy from '~icons/mdi/content-copy'
import MdiCodeBraces from '~icons/mdi/code-braces'
import McpLogo from '~icons/simple-icons/modelcontextprotocol'

const MCP_ENDPOINT = 'https://mcp.dxrating.net/mcp'
// ?via= tells the MCP server's analytics which link brought a visitor; the guide page ignores it.
const MCP_GUIDE_URL = 'https://mcp.dxrating.net/?via=dxrating-developers'
const API_BASE = 'https://miruku.dxrating.net/api/v1'
const API_DOCS_URL = 'https://miruku.dxrating.net/docs'
const DXDATA_URL = `${API_BASE}/dxdata`
const API_CHANGELOG_URL = 'https://github.com/gekichumai/dxrating/issues/427'
const API_SUPPORT_URL = 'https://github.com/gekichumai/dxrating/issues'
const ATTRIBUTION_LINE = 'Data from DXRating (dxrating.net)'

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

interface OptionProps {
  id: string
  Icon: ComponentType<{ className?: string }>
  iconClassName: string
  title: string
  description: string
  endpointLabel: string
  endpoint: string
  copyLabel: string
  action: { label: string; href: string }
  links: { label: string; href: string }[]
}

const COPIED_RESET_MS = 2000

/** Copies a URL; the icon cross-fades to a check and a polite status region says it worked */
const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const { t } = useTranslation(['developers'])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <>
      <Tooltip title={label}>
        <IconButton
          size="small"
          aria-label={label}
          onClick={() => {
            // The Clipboard API is missing in insecure contexts and can be refused: say so and give the manual route
            const failed = () => {
              setCopied(false)
              toast.error(t('developers:copy-failed'), { id: 'developers-copy-failed' })
            }
            if (!navigator.clipboard) return failed()
            navigator.clipboard.writeText(value).then(() => setCopied(true), failed)
          }}
          className="relative shrink-0 !text-fg-2"
        >
          <MdiContentCopy
            aria-hidden="true"
            className={clsx(
              'size-4 transition-[opacity,transform] duration-300 ease-[var(--ease-out)] motion-reduce:transform-none',
              copied && 'opacity-0 scale-50',
            )}
          />
          <MdiCheck
            aria-hidden="true"
            className={clsx(
              'absolute size-4 text-status-positive transition-[opacity,transform] duration-300 ease-[var(--ease-out)] motion-reduce:transform-none',
              !copied && 'opacity-0 scale-50',
            )}
          />
        </IconButton>
      </Tooltip>
      <output className="sr-only">{copied ? t('developers:copied') : ''}</output>
    </>
  )
}

const Option = ({
  id,
  Icon,
  iconClassName,
  title,
  description,
  endpointLabel,
  endpoint,
  copyLabel,
  action,
  links,
}: OptionProps) => (
  <section aria-labelledby={id} className="flex flex-col px-5 py-6 md:p-8">
    <div className="flex items-center gap-3">
      <span
        className={clsx(
          'flex size-9 shrink-0 items-center justify-center rounded-full border border-solid border-transparent shadow-[var(--shadow-1)]',
          iconClassName,
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <h2 id={id} className="m-0 text-xl font-semibold leading-snug tracking-[-0.01em] text-fg-1">
        {title}
      </h2>
    </div>
    <p className="mt-3 text-base leading-relaxed text-fg-2 text-pretty">{description}</p>

    <div className="mt-5">
      <div className="text-sm font-semibold text-fg-2">{endpointLabel}</div>
      {/* The URL wraps rather than scrolls, so the whole value is visible when people copy it by hand */}
      <div className="glass-inset mt-1.5 flex items-center gap-2 ps-3 pe-1 py-1">
        <code className="min-w-0 flex-1 py-1 font-mono text-[0.8125rem] leading-normal text-fg-1 [overflow-wrap:anywhere]">
          {endpoint}
        </code>
        <CopyButton value={endpoint} label={copyLabel} />
      </div>
    </div>

    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
      <Button
        variant="contained"
        disableElevation
        href={action.href}
        {...externalLinkProps}
        endIcon={<MdiArrowTopRight aria-hidden="true" className="size-4" />}
        className="!min-h-10 !no-underline"
      >
        {action.label}
      </Button>
      {links.map((link) => (
        <a key={link.href} href={link.href} {...externalLinkProps} className="link text-sm font-semibold">
          {link.label}
        </a>
      ))}
    </div>
  </section>
)

const InlineLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} {...externalLinkProps} className="link font-semibold">
    {children}
  </a>
)

const Term = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="grid gap-1 py-4 first:pt-0 last:pb-0 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-6">
    <dt className="text-sm font-semibold text-fg-1">{title}</dt>
    <dd className="m-0 max-w-[68ch] text-sm leading-relaxed text-fg-2 text-pretty">{children}</dd>
  </div>
)

export const DevelopersPage = () => {
  const { t, i18n } = useTranslation(['developers'])

  return (
    <div
      // Korean wraps at spaces; breaking inside words reads badly at phone widths.
      className={clsx(
        'w-full max-w-4xl mx-auto px-4 pt-8 md:pt-14 pb-global text-fg-1',
        i18n.language === 'ko' && 'break-keep',
      )}
      itemScope
      itemType="https://schema.org/WebPage"
    >
      <article className="glass overflow-hidden">
        <header className="px-5 pt-7 pb-6 md:px-8 md:pt-10 md:pb-8 border-b border-solid border-x-0 border-t-0 border-black/8">
          <h1
            className="m-0 text-3xl md:text-4xl font-semibold leading-tight tracking-[-0.02em] text-fg-1 text-balance"
            itemProp="name"
          >
            {t('developers:title')}
          </h1>
          <p
            className="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-fg-2 text-pretty"
            itemProp="description"
          >
            {t('developers:description')}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-solid divide-black/8">
          <Option
            id="developers-mcp"
            Icon={McpLogo}
            iconClassName="bg-white text-fg-1"
            title={t('developers:mcp.title')}
            description={t('developers:mcp.description')}
            endpointLabel={t('developers:mcp.endpoint')}
            endpoint={MCP_ENDPOINT}
            copyLabel={t('developers:mcp.copy')}
            action={{ label: t('developers:mcp.action'), href: MCP_GUIDE_URL }}
            links={[]}
          />
          <Option
            id="developers-api"
            Icon={MdiCodeBraces}
            iconClassName="bg-accent-strong text-on-accent"
            title={t('developers:api.title')}
            description={t('developers:api.description')}
            endpointLabel={t('developers:api.endpoint')}
            endpoint={DXDATA_URL}
            copyLabel={t('developers:api.copy')}
            action={{ label: t('developers:api.action'), href: API_DOCS_URL }}
            links={[
              { label: 'OpenAPI', href: 'https://miruku.dxrating.net/spec.json' },
              { label: t('developers:api.changelog'), href: API_CHANGELOG_URL },
              { label: 'llms.txt', href: 'https://dxrating.net/llms.txt' },
            ]}
          />
        </div>

        <section
          aria-labelledby="developers-terms"
          className="px-5 py-6 md:p-8 border-t border-solid border-x-0 border-b-0 border-black/8"
        >
          <h2 id="developers-terms" className="m-0 text-xl font-semibold leading-snug tracking-[-0.01em] text-fg-1">
            {t('developers:terms.title')}
          </h2>
          <dl className="mt-4 divide-y divide-solid divide-x-0 divide-black/8">
            <Term title={t('developers:terms.data')}>{t('developers:terms.data-description')}</Term>
            <Term title={t('developers:terms.credit')}>
              <code className="glass-inset rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-[0.8125rem] text-fg-1">
                {ATTRIBUTION_LINE}
              </code>
            </Term>
            <Term title={t('developers:terms.limits')}>{t('developers:terms.limits-description')}</Term>
          </dl>
        </section>

        <section
          id="api-stability"
          aria-labelledby="developers-api-stability"
          className="scroll-mt-20 px-5 py-6 md:p-8 border-t border-solid border-x-0 border-b-0 border-black/8"
        >
          <h2
            id="developers-api-stability"
            className="m-0 text-xl font-semibold leading-snug tracking-[-0.01em] text-fg-1"
          >
            {t('developers:policy.title')}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-fg-2 text-pretty">{t('developers:policy.intro')}</p>
          <dl className="mt-4 divide-y divide-solid divide-x-0 divide-black/8">
            {(['compat', 'deprecation', 'versions', 'ids', 'scope'] as const).map((key) => (
              <Term key={key} title={t(`developers:policy.${key}`)}>
                {t(`developers:policy.${key}-description`)}
              </Term>
            ))}
            <Term title={t('developers:policy.updates')}>
              {t('developers:policy.updates-description')}{' '}
              <InlineLink href={API_CHANGELOG_URL}>{t('developers:api.changelog')}</InlineLink>
            </Term>
            <Term title={t('developers:policy.support')}>
              {t('developers:policy.support-description')}{' '}
              <InlineLink href={API_SUPPORT_URL}>github.com/gekichumai/dxrating</InlineLink>
            </Term>
          </dl>
        </section>
      </article>
    </div>
  )
}