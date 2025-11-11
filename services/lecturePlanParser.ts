export const parseLecturePlanResponse = (
  planText: string
): {
  generalInfo: string;
  slideSummaries: Map<number, string>;
  importantSlides: Set<number>;
} => {
  const generalInfoMatch = planText.match(
    /general info:([\s\S]*?)(Slide\s+1\s*\*?:|$)/i
  );
  const generalInfo = generalInfoMatch
    ? generalInfoMatch[1].trim()
    : "No general information was provided.";

  const slideSummaries = new Map<number, string>();
  const importantSlides = new Set<number>();

  // Match headers like "Slide 1:" or "Slide 1 *:"
  const slideSections = planText.split(/(Slide\s+\d+\s*\*?:)/i);

  for (let i = 1; i < slideSections.length; i += 2) {
    const slideHeader = slideSections[i];
    const slideNumberMatch = slideHeader.match(/Slide\s+(\d+)/i);
    const isImportant = /\*/.test(slideHeader);
    if (slideNumberMatch) {
      const slideNumber = parseInt(slideNumberMatch[1], 10);
      const summary = (slideSections[i + 1] || "").trim();
      slideSummaries.set(slideNumber, summary);
      if (isImportant) importantSlides.add(slideNumber);
    }
  }

  return { generalInfo, slideSummaries, importantSlides };
};
