import { FunctionDeclaration, Type } from "@google/genai";
import { CanvasBlock } from "../types";

/**
 * Normalizes various input formats into CanvasBlock array
 */
export const normalizeCanvasBlocks = (input: any): CanvasBlock[] => {
  // Markdown-only normalization
  const coerceToMarkdown = (item: any): CanvasBlock | null => {
    if (item == null) return null;
    if (typeof item === "string") {
      return { type: "markdown", content: item };
    }
    if (typeof item === "object") {
      const possibleContent =
        typeof item.content === "string"
          ? item.content
          : JSON.stringify(item, null, 2);
      return { type: "markdown", content: possibleContent };
    }
    return { type: "markdown", content: String(item) };
  };

  if (
    input &&
    !Array.isArray(input) &&
    (typeof input === "object" || typeof input === "string")
  ) {
    const coerced = coerceToMarkdown(input);
    return coerced ? [coerced] : [];
  }

  if (Array.isArray(input)) {
    return (input.map(coerceToMarkdown).filter(Boolean) as CanvasBlock[]) || [];
  }

  return [
    {
      type: "markdown",
      content:
        typeof input === "string" ? input : JSON.stringify(input, null, 2),
    },
  ];
};

export const setActiveSlideFunctionDeclaration: FunctionDeclaration = {
  name: "setActiveSlide",
  description:
    "Sets the active presentation slide to the specified slide number. Use this function to navigate the presentation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      slideNumber: {
        type: Type.NUMBER,
        description:
          "The number of the slide to display. Note: Slide numbers are 1-based.",
      },
    },
    required: ["slideNumber"],
  },
};

export const provideCanvasMarkdownFunctionDeclaration: FunctionDeclaration = {
  name: "provideCanvasMarkdown",
  description:
    "Render markdown content on the canvas. Supports GFM, KaTeX math ($ and $$), Mermaid diagrams (```mermaid), emojis, code highlighting, tables, and all standard markdown features.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      markdown: {
        type: Type.STRING,
        description:
          "Raw markdown string containing text, math, diagrams, emojis, etc. Use $...$ for inline math, $$...$$ for block math, and ```mermaid ... ``` for Mermaid diagrams.",
      },
    },
    required: ["markdown"],
  },
};

// Tunables
export const REANCHOR_EVERY_N_TURNS = 6; // set 0 to disable
export const ENABLE_SERVER_INTERRUPT = true;

