import { Slide, SlideGroup } from "../types";
import { getGenAI } from "./genaiClient";

type GenerateContentResponseLike = { text: string };

// Simple in-memory cache to dedupe grouping calls (e.g., StrictMode double invoke)
const CACHE_TTL_MS = 60_000;
const groupingCache = new Map<
  string,
  { promise: Promise<SlideGroup[]>; timestamp: number }
>();

const GROUPING_PROMPT_HEADER = `You are an expert instructional designer. Group the slides into coherent topical sections.

INPUT:
- You will receive a list of slides with slide numbers and short summaries.

OUTPUT:
- Return ONLY valid JSON (no code fences, no commentary) in the exact shape:
[
  { "title": "Group Title 1", "slideNumbers": [1,2,3] },
  { "title": "Group Title 2", "slideNumbers": [4,5] }
]

STRICT RULES:
- Use ascending slide numbers.
- Every slide from 1..N must appear exactly once.
- 2–7 groups total depending on content.
- Keep titles short (≤ 40 chars).
`;

function buildGroupingPrompt(slides: Slide[]): string {
  const lines = slides
    .map((s) =>
      `Slide ${s.pageNumber}: ${
        s.summary || s.textContent?.slice(0, 120) || ""
      }`.trim()
    )
    .join("\n");
  return `${GROUPING_PROMPT_HEADER}\n\nSlides:\n${lines}`;
}

export async function groupSlidesByAI(params: {
  slides: Slide[];
  apiKey: string | null;
  model?: string;
}): Promise<SlideGroup[]> {
  const { slides, apiKey, model } = params;
  if (!slides || slides.length === 0) return [];

  const modelToUse = model || "gemini-2.5-pro";
  const signature =
    `${modelToUse}::` +
    slides.map((s) => `${s.pageNumber}:${s.summary || ""}`).join("|");

  const now = Date.now();
  const cached = groupingCache.get(signature);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.promise;
  }

  const ai = getGenAI(apiKey);
  const prompt = buildGroupingPrompt(slides);
  const textPart = { text: prompt };

  const promise: Promise<SlideGroup[]> = (async () => {
    const response: GenerateContentResponseLike = await (
      ai.models.generateContent as any
    )({
      model: modelToUse,
      contents: { parts: [textPart] },
    });

    let groups: SlideGroup[] = [];
    try {
      groups = JSON.parse(response.text) as SlideGroup[];
    } catch {
      // Try to recover if the model added stray text around JSON
      const match = response.text.match(/\[\s*{[\s\S]*}\s*\]/);
      if (match) {
        groups = JSON.parse(match[0]) as SlideGroup[];
      } else {
        throw new Error("Failed to parse grouping JSON from AI response.");
      }
    }

    // Basic validation and normalization
    const totalSlides = slides.length;
    const seen = new Set<number>();
    for (const g of groups) {
      g.slideNumbers = Array.from(
        new Set(
          g.slideNumbers.filter(
            (n) => Number.isInteger(n) && n >= 1 && n <= totalSlides
          )
        )
      ).sort((a, b) => a - b);
      g.title = (g.title || "").slice(0, 80);
      for (const n of g.slideNumbers) seen.add(n);
    }

    // If any slides are missing, append them to a catch-all group
    const missing: number[] = [];
    for (let i = 1; i <= totalSlides; i++) {
      if (!seen.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      groups.push({ title: "Other", slideNumbers: missing });
    }

    // Ensure not empty
    if (groups.length === 0) {
      groups = [
        { title: "All Slides", slideNumbers: slides.map((s) => s.pageNumber) },
      ];
    }

    return groups;
  })();

  groupingCache.set(signature, { promise, timestamp: now });
  return promise;
}
