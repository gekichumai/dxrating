import { marked } from 'marked'

export const Markdown = ({ content }: { content?: string | null }) => {
  return (
    <div
      // biome-ignore lint/security/noDangerouslySetInnerHtml: using marked is safe
      dangerouslySetInnerHTML={{
        __html: marked(content ?? ''),
      }}
    />
  )
}
