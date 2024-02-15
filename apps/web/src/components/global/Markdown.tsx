import { marked } from "marked";

export const Markdown = ({ content }: { content?: string }) => {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: marked(content ?? ""),
      }}
    />
  );
};
