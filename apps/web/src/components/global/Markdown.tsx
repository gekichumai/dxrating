import { marked } from 'marked'

export const Markdown = ({ content }: { content?: string | null }) => {
  return (
    <div
      // oxlint-disable-next-line react/no-danger -- using marked is safe
      dangerouslySetInnerHTML={{
        __html: marked(content ?? ''),
      }}
    />
  )
}