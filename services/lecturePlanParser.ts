export const parseLecturePlanResponse = (planText: string): { generalInfo: string; slideSummaries: Map<number, string> } => {
  const generalInfoMatch = planText.match(/general info:([\s\S]*?)(Slide 1:|$)/i);
  const generalInfo = generalInfoMatch ? generalInfoMatch[1].trim() : 'No general information was provided.';

  const slideSummaries = new Map<number, string>();
  const slideSections = planText.split(/(Slide \d+:)/i);

  for (let i = 1; i < slideSections.length; i += 2) {
    const slideHeader = slideSections[i];
    const slideNumberMatch = slideHeader.match(/(\d+)/);
    if (slideNumberMatch) {
      const slideNumber = parseInt(slideNumberMatch[1], 10);
      const summary = (slideSections[i + 1] || '').trim();
      slideSummaries.set(slideNumber, summary);
    }
  }

  return { generalInfo, slideSummaries };
};


