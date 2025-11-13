import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import rehypePrismPlus from "rehype-prism-plus";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { InlineMath, BlockMath } from "react-katex";
import Mermaid from "./Mermaid";
import "katex/dist/katex.min.css";
import "./katex-dark.css";
import "prismjs/themes/prism-tomorrow.css";

interface MarkdownRendererProps {
  markdown: string;
}

type ContentSegment =
  | { type: "markdown"; content: string }
  | { type: "math-inline"; content: string }
  | { type: "math-block"; content: string };

// Helper to extract text content from React children
const extractTextFromChildren = (children: React.ReactNode): string => {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join("");
  }
  if (React.isValidElement(children)) {
    if (children.props?.children) {
      return extractTextFromChildren(children.props.children);
    }
    return "";
  }
  return "";
};

// Helper to render text with inline math
const renderTextWithInlineMath = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Match inline math: $...$ but not $$
  const inlineMathRegex = /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g;
  let match;
  const matches: Array<{ index: number; length: number; content: string }> = [];

  while ((match = inlineMathRegex.exec(remaining)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      content: match[1].trim(),
    });
  }

  if (matches.length === 0) {
    return [<React.Fragment key={0}>{text}</React.Fragment>];
  }

  let lastIndex = 0;
  matches.forEach((mathMatch) => {
    // Add text before math
    if (mathMatch.index > lastIndex) {
      const beforeText = remaining.substring(lastIndex, mathMatch.index);
      if (beforeText) {
        parts.push(<React.Fragment key={key++}>{beforeText}</React.Fragment>);
      }
    }

    // Add math
    parts.push(
      <span key={key++} dir="ltr">
        <InlineMath math={mathMatch.content} errorColor="#cc0000" />
      </span>
    );

    lastIndex = mathMatch.index + mathMatch.length;
  });

  // Add remaining text
  if (lastIndex < remaining.length) {
    const afterText = remaining.substring(lastIndex);
    if (afterText) {
      parts.push(<React.Fragment key={key++}>{afterText}</React.Fragment>);
    }
  }

  return parts;
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ markdown }) => {
  // Split markdown into segments: markdown text and block math expressions
  const segments = useMemo(() => {
    const result: ContentSegment[] = [];
    let remaining = markdown;
    let lastIndex = 0;

    // Find only block math ($$...$$) - inline math will be handled in text components
    const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
    let match;
    const matches: Array<{ index: number; length: number; content: string }> =
      [];

    while ((match = blockMathRegex.exec(remaining)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        content: match[1].trim(),
      });
    }

    // Build segments
    matches.forEach((mathMatch) => {
      // Add markdown before this math
      if (mathMatch.index > lastIndex) {
        const markdownContent = remaining.substring(lastIndex, mathMatch.index);
        if (markdownContent.trim()) {
          result.push({ type: "markdown", content: markdownContent });
        }
      }

      // Add block math segment
      result.push({
        type: "math-block",
        content: mathMatch.content,
      });

      lastIndex = mathMatch.index + mathMatch.length;
    });

    // Add remaining markdown
    if (lastIndex < remaining.length) {
      const markdownContent = remaining.substring(lastIndex);
      if (markdownContent.trim()) {
        result.push({ type: "markdown", content: markdownContent });
      }
    }

    // If no block math found, return entire content as markdown
    if (result.length === 0) {
      result.push({ type: "markdown", content: markdown });
    }

    return result;
  }, [markdown]);

  // Extended schema for sanitization
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
      className="markdown-content text-gray-200 [&>*:first-child]:mt-0 break-words"
      style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      dir="auto"
    >
      {segments.map((segment, index) => {
        if (segment.type === "math-block") {
          return (
            <div
              key={index}
              className="my-4 overflow-x-auto katex-block"
              dir="ltr"
            >
              <BlockMath math={segment.content} errorColor="#cc0000" />
            </div>
          );
        }

        return (
          <React.Fragment key={index}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkEmoji]}
              rehypePlugins={[
                [rehypePrismPlus, { ignoreMissing: true }],
                [rehypeSanitize, extendedSchema],
              ]}
              components={{
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
                p: ({ node, children, ...props }) => {
                  // Extract text content from children (handles React elements)
                  const content = extractTextFromChildren(children);
                  const hasInlineMath =
                    /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/.test(content);

                  if (hasInlineMath) {
                    const parts = renderTextWithInlineMath(content);
                    return (
                      <p className="mb-3 leading-relaxed" {...props}>
                        {parts}
                      </p>
                    );
                  }

                  return (
                    <p className="mb-3 leading-relaxed" {...props}>
                      {children}
                    </p>
                  );
                },
                // Handle inline math in other text elements
                strong: ({ node, children, ...props }) => {
                  const content = extractTextFromChildren(children);
                  const hasInlineMath =
                    /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/.test(content);
                  if (hasInlineMath) {
                    const parts = renderTextWithInlineMath(content);
                    return (
                      <strong
                        className="font-semibold text-gray-100"
                        {...props}
                      >
                        {parts}
                      </strong>
                    );
                  }
                  return (
                    <strong className="font-semibold text-gray-100" {...props}>
                      {children}
                    </strong>
                  );
                },
                em: ({ node, children, ...props }) => {
                  const content = extractTextFromChildren(children);
                  const hasInlineMath =
                    /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/.test(content);
                  if (hasInlineMath) {
                    const parts = renderTextWithInlineMath(content);
                    return (
                      <em className="italic" {...props}>
                        {parts}
                      </em>
                    );
                  }
                  return (
                    <em className="italic" {...props}>
                      {children}
                    </em>
                  );
                },
                li: ({ node, children, ...props }) => {
                  const content = extractTextFromChildren(children);
                  const hasInlineMath =
                    /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/.test(content);
                  if (hasInlineMath) {
                    const parts = renderTextWithInlineMath(content);
                    return (
                      <li className="ml-2" {...props}>
                        {parts}
                      </li>
                    );
                  }
                  return (
                    <li className="ml-2" {...props}>
                      {children}
                    </li>
                  );
                },
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
                  const codeString = extractTextFromChildren(children).replace(
                    /\n$/,
                    ""
                  );

                  if (language === "mermaid") {
                    return <Mermaid content={codeString} />;
                  }

                  if (inline) {
                    return (
                      <code
                        className={`${
                          className || ""
                        } bg-gray-900 px-1 py-0.5 rounded-sm text-sm font-mono text-gray-200`}
                        dir="ltr"
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
                      dir="ltr"
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
                      dir="ltr"
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
              }}
            >
              {segment.content}
            </ReactMarkdown>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default MarkdownRenderer;
