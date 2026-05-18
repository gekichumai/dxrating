import clsx from 'clsx'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

export const SheetAltNames: FC<{ altNames: string[] }> = ({ altNames }) => {
  const { t } = useTranslation(['sheet'])
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={clsx('text-sm text-slate-600 overflow-hidden', !expanded && 'max-h-[7rem]')}
      style={{
        mask: expanded
          ? undefined
          : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)',
        WebkitMask: expanded
          ? undefined
          : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)',
      }}
    >
      {altNames?.map((altName, i) => (
        <span className="inline-block whitespace-pre-line" key={altName}>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-inherit font-inherit text-left"
            onClick={() => {
              setExpanded(true)
              if (altName.length > 50) {
                const sanitizedAltName = altName.trim()
                navigator.clipboard.writeText(`${sanitizedAltName}是什么歌`)
                toast.success(t('sheet:copy-alt-name.toast-success', { content: `${sanitizedAltName}是什么歌` }), {
                  id: `copy-sheet-alt-name-${altName}`,
                })
              } else {
                const sanitizedAltName = altName
                  .trim()
                  .replace(/[\s|\n|，|。|！|@|；|《|》|？|：|【|】|（|）|、|·|~|!|#|%|&|*|(|)|{|}|\\[|\\]|\\|]/g, '-')
                navigator.clipboard.writeText(`https://${sanitizedAltName}.是什么歌.com`)
                toast.success(t('sheet:copy-alt-name.toast-success', { content: `${sanitizedAltName}.是什么歌.com` }), {
                  id: `copy-sheet-alt-name-${altName}`,
                })
              }
            }}
          >
            {altName}
          </button>
          {i < altNames.length - 1 && <span className="text-slate-400 mx-1 select-none">/</span>}
        </span>
      ))}
    </div>
  )
}