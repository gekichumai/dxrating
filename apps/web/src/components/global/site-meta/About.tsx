import { VersionEnum } from '@gekichumai/dxdata'
import { useCatalogDocument } from '@/catalog/CatalogContext'
import { IconButton } from '@mui/material'
import clsx from 'clsx'
import { type FC, type PropsWithChildren, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiGithub from '~icons/mdi/github'
import MdiApi from '~icons/mdi/api'
import MdiInformation from '~icons/mdi/information'
import MdiTwitter from '~icons/mdi/twitter'
import MdiWeb from '~icons/mdi/web'
import McpLogo from '~icons/simple-icons/modelcontextprotocol'
import { BUNDLE } from '../../../utils/bundle'
import { useTime } from '../../../utils/useTime'
import { ResponsiveDialog } from '../ResponsiveDialog'
import { captureAnalyticsEvent } from '@/lib/analytics'

const ExternalLink: FC<PropsWithChildren<{ href: string; className?: string }>> = ({ href, children, className }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={clsx('link inline-flex items-center gap-1 break-all', className)}
  >
    {children}
  </a>
)

const AboutLink: FC<PropsWithChildren<{ href: string; startAdornment?: ReactNode; label: string }>> = ({
  href,
  startAdornment,
  label,
  children,
}) => (
  <li className="flex md:flex-row flex-col md:gap-3 gap-0.5">
    <span className="font-semibold text-fg-1 md:w-60 md:shrink-0">{label}</span>
    <ExternalLink href={href}>
      {startAdornment}
      {children}
    </ExternalLink>
  </li>
)

const AboutAttribute: FC<PropsWithChildren<{ label: ReactNode; value: ReactNode }>> = ({ label, value }) => (
  <>
    <dt className="text-xs font-semibold text-fg-2">{label}</dt>
    <dd className="m-0 font-mono text-sm text-fg-1 num">{value}</dd>
  </>
)

export const About = () => {
  const { t } = useTranslation(['about'])
  const [expanded, setExpanded] = useState(false)

  const buildTime = useTime(BUNDLE.buildTime)
  const updateTime = useTime(useCatalogDocument().updatedAt)

  return (
    <>
      <IconButton
        onClick={() => {
          setExpanded(true)
          captureAnalyticsEvent('about_dialog_opened', {})
        }}
        aria-label={t('about:open')}
        title={t('about:open')}
      >
        <MdiInformation aria-hidden="true" />
      </IconButton>

      <ResponsiveDialog open={expanded} setOpen={(opened) => setExpanded(opened)} title={t('about:title')}>
        {() => (
          <div className="flex flex-col gap-6 text-sm">
            <ul className="m-0 p-0 list-none flex flex-col gap-3 md:gap-2">
              <AboutLink
                href="https://dxrating.net/developers"
                startAdornment={<MdiApi />}
                label={t('about:developers-api')}
              >
                dxrating.net/developers
              </AboutLink>

              <AboutLink
                href="https://mcp.dxrating.net/?via=dxrating-about"
                startAdornment={<McpLogo />}
                label={t('about:mcp-server')}
              >
                mcp.dxrating.net
              </AboutLink>

              <AboutLink
                href="https://github.com/gekichumai/dxrating"
                startAdornment={<MdiGithub />}
                label={t('about:source-code')}
              >
                gekichumai/dxrating
              </AboutLink>

              <AboutLink
                href="https://twitter.com/maiLv_Chihooooo"
                startAdornment={<MdiTwitter />}
                label={t('about:internal-level-value')}
              >
                maimai譜面定数ちほー🏖☀️ (@maiLv_Chihooooo)
              </AboutLink>

              <AboutLink
                href="https://arcade-songs.zetaraku.dev/maimai/about/"
                startAdornment={<MdiWeb />}
                label={t('about:chart-metadata')}
              >
                arcade-songs.zetaraku.dev
              </AboutLink>

              <AboutLink
                href="https://gamerch.com/maimai/"
                startAdornment={<MdiWeb />}
                label={t('about:chart-metadata-extended')}
              >
                gamerch.com/maimai
              </AboutLink>

              <AboutLink
                href="https://github.com/Yuri-YuzuChaN/maimaiDX"
                startAdornment={<MdiGithub />}
                label={t('about:fesplus-background')}
              >
                Yuri-YuzuChaN/maimaiDX
              </AboutLink>

              <AboutLink
                href="https://github.com/Yuri-YuzuChaN/maimaiDX"
                startAdornment={<MdiGithub />}
                label={t('about:aliases.yuri-yuzuchan-maimaidx')}
              >
                Yuri-YuzuChaN/maimaiDX (via API)
              </AboutLink>

              <AboutLink
                href="https://github.com/lomotos10/GCM-bot"
                startAdornment={<MdiGithub />}
                label={t('about:aliases.lomotos10-gcmbot')}
              >
                lomotos10/GCM-bot
              </AboutLink>
            </ul>

            <section className="flex flex-col items-start gap-1">
              <h3 className="m-0 text-sm font-semibold text-fg-1">{t('about:disclaimer.title')}</h3>

              <div className="text-sm text-fg-2 max-w-[65ch] text-pretty">
                {t('about:disclaimer.content')
                  .split('\n')
                  .map((line) => (
                    <p key={line} className="m-0">
                      {line}
                    </p>
                  ))}
              </div>
            </section>

            <div className="flex flex-col items-start gap-3">
              <img
                className="h-12 w-auto touch-callout-none"
                src="https://shama.dxrating.net/images/version-adornment/buddies.png"
                alt={t('about:version.logo-alt', { version: VersionEnum.BUDDiES })}
                draggable={false}
              />

              <dl className="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
                <AboutAttribute
                  label={t('about:version.commit')}
                  // value={BUNDLE.gitCommit?.slice(0, 7) || "unknown"}
                  value={
                    BUNDLE.gitCommit ? (
                      <ExternalLink href={`https://github.com/gekichumai/dxrating/commit/${BUNDLE.gitCommit}`}>
                        {BUNDLE.gitCommit?.slice(0, 7) || t('about:version.unknown')}
                      </ExternalLink>
                    ) : (
                      t('about:version.unknown')
                    )
                  }
                />

                {BUNDLE.buildNumber !== undefined && (
                  <AboutAttribute label={t('about:version.build')} value={`#${BUNDLE.buildNumber}`} />
                )}

                <AboutAttribute
                  label={t('about:version.build-time')}
                  value={BUNDLE.buildTime ? buildTime : t('about:version.unknown')}
                />

                <AboutAttribute label={t('about:version.upstream-data-update-time')} value={updateTime} />
              </dl>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  )
}