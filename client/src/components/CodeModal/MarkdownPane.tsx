import { SolidMarkdown } from "solid-markdown";
import remarkGfm from "remark-gfm";
import { rehypeWrapSelection } from "../../markdown/rehypeWrapSelection";
import { remarkHighlightSelection } from "../../markdown/remarkHighlightSelection";
import { resolveMarkdownImageSrc } from "../../utils/markdownImageSrc";

export function MarkdownPane(props: {
  rawCode: () => string;
  filePath: () => string | null;
  lineFilterEnabled: () => boolean;
  targetStartLine: () => number | null;
  targetEndLine: () => number | null;
}) {
  return (
    <div class="markdown-preview p-4 prose prose-invert max-w-none">
      <SolidMarkdown
        children={props.rawCode()}
        remarkPlugins={
          props.lineFilterEnabled() &&
          typeof props.targetStartLine() === "number" &&
          typeof props.targetEndLine() === "number"
            ? [
                remarkGfm,
                [
                  remarkHighlightSelection,
                  {
                    startLine: props.targetStartLine(),
                    endLine: props.targetEndLine(),
                  },
                ],
              ]
            : [remarkGfm]
        }
        rehypePlugins={[rehypeWrapSelection]}
        components={{
          img: (imgProps) => {
            if (!imgProps.src) return null;
            const src = resolveMarkdownImageSrc(imgProps.src, props.filePath());
            return (
              <img
                {...imgProps}
                src={src}
                class="max-w-full rounded-lg border border-gray-700 my-4"
              />
            );
          },
        }}
      />
    </div>
  );
}


