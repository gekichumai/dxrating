import clsx from 'clsx'
import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import MdiArrowTopRight from '~icons/mdi/arrow-top-right'
import MdiCodeBraces from '~icons/mdi/code-braces'
import McpLogo from '~icons/simple-icons/modelcontextprotocol'

const MCP_ENDPOINT = 'https://mcp.dxrating.net/mcp'
// ?via= tells the MCP server's analytics which link brought a visitor; the guide page ignores it.
const MCP_GUIDE_URL = 'https://mcp.dxrating.net/?via=dxrating-developers'
const API_BASE = 'https://miruku.dxrating.net/api/v1'
const API_DOCS_URL = 'https://miruku.dxrating.net/docs'
const DATA_LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/'
const ATTRIBUTION_LINE = 'Data from DXRating (dxrating.net), CC BY-NC 4.0'

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

interface OptionProps {
  id: string
  Icon: ComponentType<{ className?: string }>
  iconClassName: string
  title: string
  description: string
  endpointLabel: string
  endpoint: string
  action: { label: string; href: string }
  links: { label: string; href: string }[]
}

const Option = ({
  id,
  Icon,
  iconClassName,
  title,
  description,
  endpointLabel,
  endpoint,
  action,
  links,
}: OptionProps) => (
  <section
    aria-labelledby={id}
    className="flex flex-col rounded-2xl border border-solid border-black/10 bg-white p-5 md:p-6 shadow-sm"
  >
    <div className="flex items-center gap-3">
      <span
        className={clsx(
          'flex size-9 shrink-0 items-center justify-center rounded-full border-1 border-solid border-black/20 shadow',
          iconClassName,
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <h2 id={id} className="text-xl font-semibold tracking-tight text-zinc-950">
        {title}
      </h2>
    </div>
    <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 text-pretty">{description}</p>

    <div className="mt-5">
      <div className="text-xs font-medium text-zinc-500">{endpointLabel}</div>
      <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 font-mono text-[13px] text-zinc-900">
        {endpoint}
      </code>
    </div>

    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
      <a
        href={action.href}
        {...externalLinkProps}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white! no-underline transition-colors hover:bg-zinc-700"
      >
        {action.label}
        <MdiArrowTopRight className="size-4" />
      </a>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          {...externalLinkProps}
          className="text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900"
        >
          {link.label}
        </a>
      ))}
    </div>
  </section>
)

const Term = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="grid gap-1 py-4 first:pt-0 last:pb-0 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-6">
    <dt className="text-sm font-semibold text-zinc-950">{title}</dt>
    <dd className="text-sm leading-relaxed text-zinc-600 text-pretty">{children}</dd>
  </div>
)

export const DevelopersPage = () => {
  const { t, i18n } = useTranslation(['developers'])

  return (
    <div
      // Korean wraps at spaces; breaking inside words reads badly at phone widths.
      className={clsx(
        'w-full max-w-4xl mx-auto px-4 pt-8 md:pt-14 pb-global text-zinc-950',
        i18n.language === 'ko' && 'break-keep',
      )}
      itemScope
      itemType="https://schema.org/WebPage"
    >
      <header className="rounded-2xl bg-white/85 px-5 py-6 md:px-8 md:py-8 shadow-sm backdrop-blur">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance" itemProp="name">
          {t('developers:title')}
        </h1>
        <p
          className="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-zinc-600 text-pretty"
          itemProp="description"
        >
          {t('developers:description')}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Option
          id="developers-mcp"
          Icon={McpLogo}
          iconClassName="bg-white text-black"
          title={t('developers:mcp.title')}
          description={t('developers:mcp.description')}
          endpointLabel={t('developers:mcp.endpoint')}
          endpoint={MCP_ENDPOINT}
          action={{ label: t('developers:mcp.action'), href: MCP_GUIDE_URL }}
          links={[]}
        />
        <Option
          id="developers-api"
          Icon={MdiCodeBraces}
          iconClassName="bg-slate-900 text-white"
          title={t('developers:api.title')}
          description={t('developers:api.description')}
          endpointLabel={t('developers:api.endpoint')}
          endpoint={API_BASE}
          action={{ label: t('developers:api.action'), href: API_DOCS_URL }}
          links={[
            { label: 'OpenAPI', href: 'https://miruku.dxrating.net/spec.json' },
            { label: 'dxdata', href: `${API_BASE}/dxdata` },
            { label: 'llms.txt', href: 'https://dxrating.net/llms.txt' },
          ]}
        />
      </div>

      <section
        aria-labelledby="developers-terms"
        className="mt-4 rounded-2xl border border-solid border-black/10 bg-white p-5 md:p-6 shadow-sm"
      >
        <h2 id="developers-terms" className="text-xl font-semibold tracking-tight">
          {t('developers:terms.title')}
        </h2>
        <dl className="mt-4 divide-y divide-solid divide-x-0 divide-zinc-200">
          <Term title={t('developers:terms.license')}>
            {t('developers:terms.license-description')}{' '}
            <a
              href={DATA_LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer license"
              className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4"
            >
              CC BY-NC 4.0
            </a>
          </Term>
          <Term title={t('developers:terms.credit')}>
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-zinc-900">
              {ATTRIBUTION_LINE}
            </code>
          </Term>
          <Term title={t('developers:terms.limits')}>{t('developers:terms.limits-description')}</Term>
        </dl>
      </section>
    </div>
  )
}