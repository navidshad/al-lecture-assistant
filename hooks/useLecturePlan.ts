import { useCallback, useState } from "react";
import { LectureConfig, LectureSession, Slide } from "../types";
import { parsePdf } from "../services/pdfUtils";
import { getGenAI } from "../services/genaiClient";
import { parseLecturePlanResponse } from "../services/lecturePlanParser";
import { generateSessionId } from "../utils/id";

interface UseLecturePlanOptions {
  apiKey: string | null;
  selectedLanguage: string;
  selectedVoice: string;
  selectedModel: string;
}

interface UseLecturePlanResult {
  isLoading: boolean;
  loadingText: string;
  error: string | null;
  createSessionFromPdf: (file: File) => Promise<LectureSession>;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64String = result.split(",")[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function useLecturePlan({
  apiKey,
  selectedLanguage,
  selectedVoice,
  selectedModel,
}: UseLecturePlanOptions): UseLecturePlanResult {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createSessionFromPdf = useCallback(
    async (file: File): Promise<LectureSession> => {
      setIsLoading(true);
      setError(null);
      try {
        setLoadingText("Parsing your PDF for slide images...");
        const parsedSlides = await parsePdf(file);

        setLoadingText("Generating AI lecture plan... This may take a minute.");
        const ai = getGenAI(apiKey);

        const base64Pdf = await fileToBase64(file);
        const pdfPart = {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Pdf,
          },
        };

        const prompt = `You are an expert instructional designer. Analyze the provided PDF document and generate a concise lecture plan in the following format.
- Do NOT add any markdown formatting like \`\`\` or bolding.
- The output must be plain text.
- The description for "general info" should be a single paragraph.
- The description for each slide must be a single sentence.

general info:
<Provide a brief, one-paragraph overview of the entire presentation's purpose and key takeaways.>

Slide 1:
<Provide a one-sentence description of the content on this slide.>

Slide 2:
<Provide a one-sentence description of the content on this slide.>

... continue for all slides in the document.`;

        const textPart = { text: prompt };

        // Using a minimal response typing for compatibility with current SDK shape
        type GenerateContentResponseLike = { text: string };
        const response: GenerateContentResponseLike = await (
          ai.models.generateContent as any
        )({
          model: "gemini-2.5-pro",
          contents: { parts: [textPart, pdfPart] },
        });

        const lecturePlanText: string = response.text;
        const { generalInfo, slideSummaries } =
          parseLecturePlanResponse(lecturePlanText);

        const enhancedSlides: Slide[] = parsedSlides.map((parsedSlide) => {
          const summary = slideSummaries.get(parsedSlide.pageNumber);
          return {
            ...parsedSlide,
            summary: summary ?? "No summary was generated for this slide.",
          };
        });

        const lectureConfig: LectureConfig = {
          language: selectedLanguage,
          voice: selectedVoice,
          model: selectedModel,
        };

        const newSession: LectureSession = {
          id: generateSessionId(file.name),
          fileName: file.name,
          createdAt: Date.now(),
          slides: enhancedSlides,
          generalInfo,
          transcript: [],
          currentSlideIndex: 0,
          lectureConfig,
        };

        return newSession;
      } catch (err) {
        setError(
          "Failed to process PDF. The AI may be busy or the file may be invalid. Please try again."
        );
        throw err;
      } finally {
        setIsLoading(false);
        setLoadingText("");
      }
    },
    [apiKey, selectedLanguage, selectedVoice, selectedModel]
  );

  return { isLoading, loadingText, error, createSessionFromPdf };
}
