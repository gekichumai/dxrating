import { useTranslation } from 'react-i18next'

const resources = [
  {
    label: 'resource.api-base',
    href: 'https://miruku.dxrating.net/api/v1',
  },
  {
    label: 'resource.openapi',
    href: 'https://miruku.dxrating.net/spec.json',
  },
  {
    label: 'resource.docs',
    href: 'https://miruku.dxrating.net/docs',
  },
  {
    label: 'resource.catalog',
    href: 'https://dxrating.net/.well-known/api-catalog',
  },
  {
    label: 'resource.agent-guide',
    href: 'https://dxrating.net/llms.txt',
  },
] as const

const accessNotes = [
  ['access.public.title', 'access.public.description'],
  ['access.auth.title', 'access.auth.description'],
  ['access.beta.title', 'access.beta.description'],
] as const

export const DevelopersPage = () => {
  const { t } = useTranslation(['developers'])

  return (
    <main
      className="w-full max-w-5xl mx-auto px-4 py-8 md:py-12 pb-global text-slate-950"
      itemScope
      itemType="https://schema.org/WebPage"
    >
      <article className="w-full rounded-2xl border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
        <header className="px-5 py-8 md:px-10 md:py-12 border-b border-slate-200">
          <p className="mb-3 text-sm font-semibold tracking-[0.14em] uppercase text-violet-700">
            {t('developers:eyebrow')}
          </p>
          <h1 className="max-w-3xl text-3xl md:text-5xl font-bold tracking-tight" itemProp="name">
            {t('developers:title')}
          </h1>
          <p className="max-w-3xl mt-4 text-base md:text-lg leading-relaxed text-slate-700" itemProp="description">
            {t('developers:description')}
          </p>
        </header>

        <div className="px-5 py-6 md:px-10 md:py-10 flex flex-col gap-10">
          <section aria-labelledby="developers-start">
            <div className="rounded-xl bg-slate-950 px-5 py-6 md:px-7 md:py-7 text-white">
              <h2 id="developers-start" className="text-xl md:text-2xl font-semibold">
                {t('developers:start.title')}
              </h2>
              <p className="mt-2 max-w-3xl text-sm md:text-base leading-relaxed text-slate-300">
                {t('developers:start.description')}
              </p>

              <dl className="mt-6 grid grid-cols-1 gap-3">
                {resources.map(({ label, href }) => (
                  <div
                    key={href}
                    className="grid grid-cols-1 gap-1 border-t border-slate-700 pt-3 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-4"
                  >
                    <dt className="text-sm font-medium text-slate-300">{t(`developers:${label}`)}</dt>
                    <dd className="min-w-0">
                      <a
                        className="inline-flex max-w-full break-all font-mono text-sm text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-200"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {href}
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section aria-labelledby="developers-access">
            <h2 id="developers-access" className="text-2xl font-semibold tracking-tight">
              {t('developers:access.title')}
            </h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {accessNotes.map(([title, description]) => (
                <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="font-semibold text-slate-950">{t(`developers:${title}`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`developers:${description}`)}</p>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-xl border border-violet-200 bg-violet-50 p-5 md:p-7"
            aria-labelledby="developers-agents"
          >
            <h2 id="developers-agents" className="text-xl md:text-2xl font-semibold tracking-tight text-violet-950">
              {t('developers:agents.title')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm md:text-base leading-relaxed text-violet-950/80">
              {t('developers:agents.description')}
            </p>
          </section>

          <section aria-labelledby="developers-guidance">
            <h2 id="developers-guidance" className="text-2xl font-semibold tracking-tight">
              {t('developers:usage.title')}
            </h2>
            <ul className="mt-4 grid gap-3 text-sm md:text-base leading-relaxed text-slate-700">
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                {t('developers:usage.cache')}
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                {t('developers:usage.links')}
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                {t('developers:usage.polling')}
              </li>
            </ul>
          </section>
        </div>
      </article>
    </main>
  )
}