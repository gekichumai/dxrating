import { dxdataUpdateTime } from '@gekichumai/dxdata'
import { IconButton } from '@mui/material'
import MdiGithub from '~icons/mdi/github'
import MdiInformation from '~icons/mdi/information'
import MdiTwitter from '~icons/mdi/twitter'
import MdiWeb from '~icons/mdi/web'
import clsx from 'clsx'
import { type FC, type PropsWithChildren, type ReactNode, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { BUNDLE } from '../../../utils/bundle'
import { useTime } from '../../../utils/useTime'
import { ResponsiveDialog } from '../ResponsiveDialog'

const ExternalLink: FC<PropsWithChildren<{ href: string; className?: string }>> = ({ href, children, className }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={clsx('inline-flex items-center gap-1 text-blue-600 hover:text-blue-500', className)}
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
  <li className="flex md:flex-row flex-col gap-1">
    <span className="font-bold mr-2">{label}</span>
    <ExternalLink href={href}>
      {startAdornment}
      {children}
    </ExternalLink>
  </li>
)

const AboutAttribute: FC<PropsWithChildren<{ label: ReactNode; value: ReactNode }>> = ({ label, value }) => (
  <li className="flex flex-col items-start font-mono">
    <span className="font-bold text-xs scale-75 origin-left-bottom text-zinc-400">{label}</span>
    <span className="text-sm tracking-tight text-zinc-600">{value}</span>
  </li>
)

export const About = () => {
  const { t } = useTranslation(['about'])
  const [expanded, setExpanded] = useState(false)

  const buildTime = useTime(BUNDLE.buildTime)
  const updateTime = useTime(dxdataUpdateTime)

  return (
    <>
      <IconButton onClick={() => setExpanded(true)}>
        <MdiInformation />
      </IconButton>

      <ResponsiveDialog open={expanded} setOpen={(opened) => setExpanded(opened)}>
        {() => (
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{t('about:title')}</h1>

            <ul className="flex flex-col gap-1.5">
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

            <div className="flex flex-col items-start mt-8 gap-1">
              <h5 className="text-base text-zinc-7">{t('about:donate.title')}</h5>

              <div className="text-sm text-zinc-6">
                <Trans
                  i18nKey="about:donate.content"
                  components={{
                    afdian: (
                      <ExternalLink href="https://afdian.com/a/dxrating" className="translate-y-0.75 items-center">
                        <MdiWeb />
                        <span>{t('about:donate.afdian')}</span>
                      </ExternalLink>
                    ),
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col items-start mt-24 gap-1">
              <h5 className="text-base text-zinc-7">{t('about:disclaimer.title')}</h5>

              <div className="text-sm text-zinc-6">
                {t('about:disclaimer.content')
                  .split('\n')
                  .map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
              </div>
            </div>

            <div className="flex flex-col items-start mt-8 gap-1">
              <img
                className="h-12 w-auto touch-callout-none mb-2"
                src="https://shama.dxrating.net/images/version-adornment/buddies.png"
                alt="Version"
                draggable={false}
              />

              <AboutAttribute
                label={t('about:version.commit')}
                // value={BUNDLE.gitCommit?.slice(0, 7) || "unknown"}
                value={
                  BUNDLE.gitCommit ? (
                    <ExternalLink href={`https://github.com/gekichumai/dxrating/commit/${BUNDLE.gitCommit}`}>
                      {BUNDLE.gitCommit?.slice(0, 7) || 'unknown'}
                    </ExternalLink>
                  ) : (
                    'unknown'
                  )
                }
              />

              {BUNDLE.buildNumber !== undefined && (
                <>
                  {' '}
                  <AboutAttribute label={t('about:version.build')} value={'#' + BUNDLE.buildNumber} />
                </>
              )}

              <AboutAttribute label={t('about:version.build-time')} value={buildTime} />

              <AboutAttribute label={t('about:version.upstream-data-update-time')} value={updateTime} />
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  )
}
