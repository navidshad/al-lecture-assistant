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
  userCustomPrompt: string;
  markImportantSlides?: boolean;
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
  userCustomPrompt,
  markImportantSlides = false,
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

        const prompt = `You are an expert instructional designer. Analyze the provided PDF and return ONLY the following lines in plain text (no markdown, no extra commentary).

- general info: A brief overview of the entire presentation in 1–2 sentences, MAX 200 characters total.
- Slide N: The main message of slide N in exactly 1 short sentence, MAX 90 characters. Repeat for all slides.
${
  markImportantSlides
    ? `- If a slide is crucial to learning the lecture (mandatory for understanding and likely exam relevance), mark the header with an asterisk after the number: "Slide N *:"`
    : ``
}

STRICT REQUIREMENTS:
- Use exactly these labels: "general info:" and "Slide N:" (e.g., Slide 1:, Slide 2:)
- Do not add bullets, numbering beyond "Slide N:", or blank lines between items
- Do not exceed the character caps; if needed, abbreviate but keep meaning
- Do not include information not visible in the slides
- Do NOT use filler/openers such as: "in this slide", "this slide shows", "on slide N", "we will", "let’s", "here we", "the following"; write the main message directly.
${
  markImportantSlides
    ? `- IMPORTANT: If a slide is important (i.e., mandatory to review to learn the lecture and likely important for the exam), put exactly one asterisk (*) after the slide number in the header (e.g., "Slide 2 *:"). Otherwise keep "Slide N:" with no asterisk.`
    : ``
}

Format:

general info:
<1–2 sentences, ≤200 chars>

Slide 1:
<1 sentence main message, ≤90 chars>

Slide 2:
<1 sentence main message, ≤90 chars>

... continue for all slides`;

        const textPart = { text: prompt };

        // Using a minimal response typing for compatibility with current SDK shape
        type GenerateContentResponseLike = { text: string };
        const response: GenerateContentResponseLike = await (
          ai.models.generateContent as any
        )({
          model: "gemini-2.5-pro",
          contents: { parts: [textPart, pdfPart] },
          generationConfig: { temperature: 0 },
        });

        const lecturePlanText: string = response.text;
        const { generalInfo, slideSummaries, importantSlides } =
          parseLecturePlanResponse(lecturePlanText);

        const enhancedSlides: Slide[] = parsedSlides.map((parsedSlide) => {
          const summary = slideSummaries.get(parsedSlide.pageNumber);
          return {
            ...parsedSlide,
            summary: summary ?? "No summary was generated for this slide.",
            isImportant: importantSlides?.has(parsedSlide.pageNumber) ?? false,
          };
        });

        const lectureConfig: LectureConfig = {
          language: selectedLanguage,
          voice: selectedVoice,
          model: selectedModel,
          prompt: userCustomPrompt,
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
    [
      apiKey,
      selectedLanguage,
      selectedVoice,
      selectedModel,
      userCustomPrompt,
      markImportantSlides,
    ]
  );

  return { isLoading, loadingText, error, createSessionFromPdf };
}
