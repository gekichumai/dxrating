import { VersionEnum } from '@gekichumai/dxdata'
import { useCatalogDocument } from '@/catalog/CatalogContext'
import { IconButton } from '@mui/material'
import clsx from 'clsx'
import { type FC, type PropsWithChildren, type ReactNode, useState } from 'react'
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
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const ExternalLink: FC<PropsWithChildren<{ href: string; className?: string }>> = ({ href, children, className }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={clsx('link inline-flex items-center gap-1 [overflow-wrap:anywhere]', className)}
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
  // Top-aligned, not stretched: when a label wraps, the link stays on its first line instead of centring on both
  <li className="flex md:flex-row md:items-start flex-col md:gap-3 gap-0.5">
    <span className="font-semibold text-fg-1 md:w-40 md:shrink-0 md:text-balance">{label}</span>
    <ExternalLink href={href}>
      {startAdornment}
      {children}
    </ExternalLink>
  </li>
)

const AboutAttribute: FC<PropsWithChildren<{ label: ReactNode; value: ReactNode }>> = ({ label, value }) => (
  <>
    <dt className="text-xs font-semibold text-fg-2">{label}</dt>
    <dd className="m-0 font-mono text-sm text-fg-1 num md:mb-1.5 md:last:mb-0">{value}</dd>
  </>
)

export const About = () => {
  const locale = useLocale()
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
        aria-label={m.about_open({}, { locale })}
        title={m.about_open({}, { locale })}
      >
        <MdiInformation aria-hidden="true" />
      </IconButton>

      <ResponsiveDialog open={expanded} setOpen={(opened) => setExpanded(opened)} title={m.about_title({}, { locale })}>
        {() => (
          // From md, credits fill the left column and the build info and disclaimer sit in a narrow right column, so the
          // dialog uses its width instead of running long. Below md it stays one column in the original order.
          <div className="flex flex-col gap-6 text-sm md:grid md:grid-cols-[minmax(0,1fr)_19rem] md:gap-8 md:items-start">
            <ul className="m-0 p-0 list-none flex flex-col gap-3 md:gap-2">
              <AboutLink
                href="https://dxrating.net/developers"
                startAdornment={<MdiApi />}
                label={m.about_developersApi({}, { locale })}
              >
                dxrating.net/developers
              </AboutLink>

              <AboutLink
                href="https://mcp.dxrating.net/?via=dxrating-about"
                startAdornment={<McpLogo />}
                label={m.about_mcpServer({}, { locale })}
              >
                mcp.dxrating.net
              </AboutLink>

              <AboutLink
                href="https://github.com/gekichumai/dxrating"
                startAdornment={<MdiGithub />}
                label={m.about_sourceCode({}, { locale })}
              >
                gekichumai/dxrating
              </AboutLink>

              <AboutLink
                href="https://twitter.com/maiLv_Chihooooo"
                startAdornment={<MdiTwitter />}
                label={m.about_internalLevelValue({}, { locale })}
              >
                maimai譜面定数ちほー🏖☀️ (@maiLv_Chihooooo)
              </AboutLink>

              <AboutLink
                href="https://arcade-songs.zetaraku.dev/maimai/about/"
                startAdornment={<MdiWeb />}
                label={m.about_chartMetadata({}, { locale })}
              >
                arcade-songs.zetaraku.dev
              </AboutLink>

              <AboutLink
                href="https://gamerch.com/maimai/"
                startAdornment={<MdiWeb />}
                label={m.about_chartMetadataExtended({}, { locale })}
              >
                gamerch.com/maimai
              </AboutLink>

              <AboutLink
                href="https://github.com/Yuri-YuzuChaN/maimaiDX"
                startAdornment={<MdiGithub />}
                label={m.about_fesplusBackground({}, { locale })}
              >
                Yuri-YuzuChaN/maimaiDX
              </AboutLink>

              <AboutLink
                href="https://github.com/Yuri-YuzuChaN/maimaiDX"
                startAdornment={<MdiGithub />}
                label={m.about_aliases_yuriYuzuchanMaimaidx({}, { locale })}
              >
                Yuri-YuzuChaN/maimaiDX (via API)
              </AboutLink>

              <AboutLink
                href="https://github.com/lomotos10/GCM-bot"
                startAdornment={<MdiGithub />}
                label={m.about_aliases_lomotos10Gcmbot({}, { locale })}
              >
                lomotos10/GCM-bot
              </AboutLink>
            </ul>

            <div className="flex flex-col gap-6 md:gap-5">
              <section className="flex flex-col items-start gap-1 md:order-last">
                <h3 className="m-0 text-sm font-semibold text-fg-1">{m.about_disclaimer_title({}, { locale })}</h3>

                <div className="text-sm md:text-xs md:leading-relaxed text-fg-2 max-w-[65ch] text-pretty">
                  {m
                    .about_disclaimer_content({}, { locale })
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
                  alt={m.about_version_logoAlt({ version: VersionEnum.BUDDiES }, { locale })}
                  draggable={false}
                />

                <dl className="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 md:grid-cols-1 md:gap-y-0">
                  <AboutAttribute
                    label={m.about_version_commit({}, { locale })}
                    // value={BUNDLE.gitCommit?.slice(0, 7) || "unknown"}
                    value={
                      BUNDLE.gitCommit ? (
                        <ExternalLink href={`https://github.com/gekichumai/dxrating/commit/${BUNDLE.gitCommit}`}>
                          {BUNDLE.gitCommit?.slice(0, 7) || m.about_version_unknown({}, { locale })}
                        </ExternalLink>
                      ) : (
                        m.about_version_unknown({}, { locale })
                      )
                    }
                  />

                  {BUNDLE.buildNumber !== undefined && (
                    <AboutAttribute label={m.about_version_build({}, { locale })} value={`#${BUNDLE.buildNumber}`} />
                  )}

                  <AboutAttribute
                    label={m.about_version_buildTime({}, { locale })}
                    value={BUNDLE.buildTime ? buildTime : m.about_version_unknown({}, { locale })}
                  />

                  <AboutAttribute label={m.about_version_upstreamDataUpdateTime({}, { locale })} value={updateTime} />
                </dl>
              </div>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  )
}