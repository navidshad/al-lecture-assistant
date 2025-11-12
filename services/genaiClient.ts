import { GoogleGenAI } from "@google/genai";

export function getGenAI(apiKey: string | null) {
  return new GoogleGenAI({ apiKey: apiKey ?? (process.env.API_KEY as string) });
}

type GenerateContentResponseLike = { text: string };

export async function fixMarkdownContent(
  markdown: string,
  apiKey: string | null
): Promise<string> {
  const genAI = getGenAI(apiKey);

  const prompt = `You are a Markdown fixer. Fix the following Markdown content. Return ONLY the corrected Markdown (no explanations, no wrapping backticks).

Requirements:
- Fix unbalanced code fences (ensure all \`\`\` are properly closed)
- Ensure Mermaid diagrams are properly fenced as \`\`\`mermaid ... \`\`\`
- Preserve KaTeX math: $...$ for inline, $$...$$ for block math
- Remove or escape unsafe HTML
- Keep all content and semantics intact
- Preserve emojis, links, images, tables

Input Markdown:
${markdown}`;

  try {
    const textPart = { text: prompt };
    const response: GenerateContentResponseLike = await (
      genAI.models.generateContent as any
    )({
      model: "gemini-2.0-flash-exp",
      contents: { parts: [textPart] },
      generationConfig: { temperature: 0 },
    });

    const text = response.text;

    // Remove any wrapping backticks or markdown code fences if present
    const cleaned = text
      .replace(/^```(?:markdown)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    return cleaned;
  } catch (error) {
    console.error("Error fixing markdown:", error);
    throw new Error(
      `Failed to fix markdown: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
