import { Slide, TranscriptEntry } from "../types";

/**
 * Builds a memory string from transcript entries for a specific slide
 */
export const buildSlideMemory = (
  entries: TranscriptEntry[],
  slideNumber: number,
  currentSlideIndex: number,
  maxMessages: number = 8,
  maxChars: number = 1800
): string => {
  // Filter entries to only those belonging to the active slide
  const filtered = entries.filter(
    (e) => (e.slideNumber ?? currentSlideIndex + 1) === slideNumber
  );
  // Get the most recent messages (limit to 5-10, default 8)
  const recent = filtered.slice(-maxMessages);
  let text = recent
    .map((e) => `${e.speaker === "user" ? "User" : "ai"}: ${e.text}`)
    .join("\n");
  if (text.length > maxChars) {
    text = text.slice(-maxChars);
  }
  return text;
};

/**
 * Builds anchor text for a slide with context
 */
export const buildSlideAnchorText = (
  slide: Slide,
  transcriptNow: TranscriptEntry[],
  currentSlideIndex: number
): string => {
  const keyTurns = buildSlideMemory(
    transcriptNow,
    slide.pageNumber,
    currentSlideIndex,
    8,
    1800
  );
  return [
    `ACTIVE SLIDE: ${slide.pageNumber}`,
    slide.summary ? `SUMMARY: ${slide.summary}` : null,
    slide.textContent
      ? `TEXT EXCERPT: ${slide.textContent.slice(0, 1000)}`
      : null,
    keyTurns ? `KEY POINTS SO FAR:\n${keyTurns}` : null,
    `FOCUS: Explain ONLY slide ${slide.pageNumber}.`,
  ]
    .filter(Boolean)
    .join("\n");
};

