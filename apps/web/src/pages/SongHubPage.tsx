import { getRouteApi } from '@tanstack/react-router'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { SongBackLink } from '@/components/song/SongBackLink'
import { SongChartsTable } from '@/components/song/hub/SongChartsTable'
import { useSongSheets } from './useSongSheets'

const routeApi = getRouteApi('/songs_/$songId')

/** `/songs/<id>`: the song's facts (artist, BPM, version, aliases) and every chart of it in one table */
export const SongHubPage: FC = () => {
  const { songId } = routeApi.useParams()
  const search = routeApi.useSearch()
  const { t } = useTranslation(['song', 'sheet'])
  const { song, searchAcronyms, flattenedSheets } = useSongSheets(songId)

  if (!song) {
    return <NotFoundContent />
  }

  const aliases = [...new Set(searchAcronyms)].filter((alias) => alias && alias !== song.title)
  const facts: { key: string; label: string; value: string }[] = [
    { key: 'artist', label: t('sheet:details.song-artist'), value: song.artist },
    ...(song.bpm ? [{ key: 'bpm', label: t('sheet:details.bpm'), value: String(song.bpm) }] : []),
    ...(song.version ? [{ key: 'version', label: t('song:hub.version'), value: String(song.version) }] : []),
  ]

  return (
    // Desktop (lg+): the song facts become a sticky left column and the charts table takes the rest of the width
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-global flex flex-col gap-4 lg:max-w-6xl lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <SongBackLink search={search} className="self-start justify-self-start -ml-2 -mb-2 lg:col-span-2" />

      <MaterialSurface as="header" className="p-3 flex gap-3 items-start lg:flex-col lg:sticky lg:top-4">
        <SheetImage
          name={song.imageName}
          size="large"
          alt={t('sheet:cover-art-alt', { title: song.title })}
          className="h-20 w-20 shrink-0 rounded-lg overflow-hidden outline outline-1 -outline-offset-1 outline-black/10 lg:w-full lg:h-auto lg:aspect-square"
        />
        <div className="min-w-0 flex flex-col gap-1 lg:w-full">
          <h1
            lang="ja"
            translate="no"
            className="m-0 text-xl font-semibold leading-tight text-fg-1 break-words text-balance"
          >
            {song.title}
          </h1>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            {facts.map((fact) => (
              <div key={fact.key} className="contents" data-testid={`song-hub-${fact.key}`}>
                <dt className="text-fg-2">{fact.label}</dt>
                <dd className="m-0 min-w-0 break-words num text-fg-1">{fact.value}</dd>
              </div>
            ))}
            {aliases.length > 0 && (
              <div className="contents" data-testid="song-hub-aliases">
                <dt className="text-fg-2">{t('song:hub.aliases')}</dt>
                <dd className="m-0 min-w-0 break-words text-fg-1">{aliases.join(' / ')}</dd>
              </div>
            )}
          </dl>
        </div>
      </MaterialSurface>

      <SongChartsTable songId={song.id} sheets={flattenedSheets} />
    </div>
  )
}