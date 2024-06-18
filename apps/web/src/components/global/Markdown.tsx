import { marked } from "marked";

export const Markdown = ({ content }: { content?: string | null }) => {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: marked(content ?? ""),
      }}
    />
  );
};
