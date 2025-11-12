import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import rehypeKatex from "rehype-katex";
import rehypePrismPlus from "rehype-prism-plus";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import Mermaid from "./Mermaid";
import "katex/dist/katex.min.css";
import "./katex-dark.css";
import "prismjs/themes/prism-tomorrow.css";

interface MarkdownRendererProps {
  markdown: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ markdown }) => {
  // Extended schema to allow KaTeX classes and safe HTML
  const extendedSchema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames || []),
      "math",
      "annotation",
      "semantics",
      "mtext",
      "mn",
      "mo",
      "mi",
      "mspace",
      "mover",
      "munder",
      "munderover",
      "msup",
      "msub",
      "msubsup",
      "mfrac",
      "mroot",
      "msqrt",
      "mtable",
      "mtr",
      "mtd",
      "mlabeledtr",
      "mrow",
      "menclose",
      "mstyle",
      "mpadded",
      "mphantom",
      "mglyph",
      "maction",
    ],
    attributes: {
      ...defaultSchema.attributes,
      "*": [
        ...(defaultSchema.attributes?.["*"] || []),
        "className",
        "class",
        "data-*",
      ],
      span: [...(defaultSchema.attributes?.span || []), "className", "class"],
      div: [...(defaultSchema.attributes?.div || []), "className", "class"],
      code: [...(defaultSchema.attributes?.code || []), "className", "class"],
      pre: [...(defaultSchema.attributes?.pre || []), "className", "class"],
      img: [
        ...(defaultSchema.attributes?.img || []),
        "loading",
        "width",
        "height",
      ],
      a: [...(defaultSchema.attributes?.a || []), "rel", "target"],
    },
  };

  return (
    <div
      className="markdown-content text-gray-200 [&>*:first-child]:mt-0"
      dir="auto"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false,
              errorColor: "#cc0000",
              fleqn: false,
              output: "html",
            },
          ],
          [rehypePrismPlus, { ignoreMissing: true }],
          [rehypeSanitize, extendedSchema],
        ]}
        components={{
          span: ({ node, className, children, ...props }) => {
            // Handle inline math (KaTeX outputs spans with katex class)
            if (className?.includes("katex")) {
              return (
                <span
                  className={`${className} inline katex-inline`}
                  {...props}
                >
                  {children}
                </span>
              );
            }
            return <span {...props}>{children}</span>;
          },
          div: ({ node, className, children, ...props }) => {
            // Handle block math (KaTeX outputs divs with katex-display class)
            if (className?.includes("katex-display")) {
              return (
                <div
                  className={`${className} my-4 overflow-x-auto katex-block`}
                  {...props}
                >
                  {children}
                </div>
              );
            }
            return <div {...props}>{children}</div>;
          },
          h1: ({ node, ...props }) => (
            <h1
              className="text-3xl font-bold mb-3 mt-4 text-gray-100"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-2xl font-bold mb-2 mt-3 text-gray-100"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-xl font-bold mb-2 mt-3 text-gray-100"
              {...props}
            />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-3 leading-relaxed" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul
              className="list-disc list-inside mb-3 space-y-1 ml-4"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal list-inside mb-3 space-y-1 ml-4"
              {...props}
            />
          ),
          li: ({ node, ...props }) => <li className="ml-2" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-gray-600 pl-4 italic my-3 text-gray-300"
              {...props}
            />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3">
              <table
                className="min-w-full border-collapse border border-gray-700"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-800" {...props} />
          ),
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => (
            <tr className="border-b border-gray-700" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-gray-700 px-4 py-2 text-left font-semibold"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-gray-700 px-4 py-2" {...props} />
          ),
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const codeString = String(children).replace(/\n$/, "");

            if (language === "mermaid") {
              return <Mermaid content={codeString} />;
            }

            if (inline) {
              return (
                <code
                  className={`${
                    className || ""
                  } bg-gray-900 px-1 py-0.5 rounded-sm text-sm font-mono text-gray-200`}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className={`${
                  className || ""
                } bg-gray-900 px-1 py-0.5 rounded-sm text-sm font-mono text-gray-200`}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ node, children, ...props }) {
            return (
              <pre
                className="bg-gray-900 p-4 rounded-md overflow-x-auto text-sm my-3"
                {...props}
              >
                {children}
              </pre>
            );
          },
          img({ node, src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt}
                className="max-w-full h-auto rounded-md my-3"
                loading="lazy"
                {...props}
              />
            );
          },
          a({ node, href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          hr: ({ node, ...props }) => (
            <hr className="my-4 border-gray-700" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-gray-100" {...props} />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
