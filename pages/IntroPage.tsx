import React, { useState, useCallback, useEffect } from 'react';
import { Slide, ParsedSlide } from '../types';
import { parsePdf } from '../services/pdfUtils';
import { UploadCloudIcon, Loader2, Globe, Volume2, Cpu } from 'lucide-react';
import { SUPPORTED_LANGUES } from '../langueges.static';
import { GoogleGenAI } from '@google/genai';


interface IntroPageProps {
  onLectureStart: (slides: Slide[], generalInfo: string, language: string, voice: string, model: string) => void;
}

const LANGUAGE_STORAGE_KEY = 'ai-lecture-assistant-language';

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // result is "data:application/pdf;base64,..."
            // we need to strip the prefix
            const base64String = result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
};

const parseLecturePlanResponse = (planText: string): { generalInfo: string; slideSummaries: Map<number, string> } => {
    const generalInfoMatch = planText.match(/general info:([\s\S]*?)(Slide 1:|$)/i);
    const generalInfo = generalInfoMatch ? generalInfoMatch[1].trim() : 'No general information was provided.';

    const slideSummaries = new Map<number, string>();
    // Split by "Slide X:" but keep the delimiter in the result
    const slideSections = planText.split(/(Slide \d+:)/i);
    
    // The regex split results in ["...general info...", "Slide 1:", "desc for 1", "Slide 2:", "desc for 2", ...]
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
}


const IntroPage: React.FC<IntroPageProps> = ({ onLectureStart }) => {
  const [isParsing, setIsParsing] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    try {
      const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (storedLanguage && SUPPORTED_LANGUES.some(l => l.title === storedLanguage)) {
        return storedLanguage;
      }
    } catch (e) {
      console.error("Failed to read language from local storage", e);
    }
    return 'English';
  });

  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-native-audio-preview-09-2025');

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    } catch (e) {
      console.error("Failed to save language to local storage", e);
    }
  }, [selectedLanguage]);

  const voices = [
    { name: 'Zephyr', description: 'Friendly Male Voice' },
    { name: 'Puck', description: 'Calm Male Voice' },
    { name: 'Charon', description: 'Deep Male Voice' },
    { name: 'Kore', description: 'Warm Female Voice' },
    { name: 'Fenrir', description: 'Rich Male Voice' },
  ];

  const models = [
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini 2.5 Flash Native Audio' },
    // The following models are commented out as they are not optimal for this use case
    // { id: 'gemini-live-2.5-flash-preview', name: 'Gemini 2.5 Flash Live' },
    // { id: 'gemini-2.0-flash-live-001', name: 'Gemini 2.0 Flash Live' },
  ];

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsParsing(true);
      setError(null);
      
      try {
        setLoadingText('Parsing your PDF for slide images...');
        const parsedSlides = await parsePdf(file);
        
        setLoadingText('Generating AI lecture plan... This may take a minute.');

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        
        const base64Pdf = await fileToBase64(file);
        const pdfPart = {
          inlineData: {
            mimeType: 'application/pdf',
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

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: { parts: [textPart, pdfPart] },
        });
        
        const lecturePlanText = response.text;
        const { generalInfo, slideSummaries } = parseLecturePlanResponse(lecturePlanText);
        
        const enhancedSlides: Slide[] = parsedSlides.map(parsedSlide => {
            const summary = slideSummaries.get(parsedSlide.pageNumber);
            return {
                ...parsedSlide,
                summary: summary ?? 'No summary was generated for this slide.',
            };
        });

        onLectureStart(enhancedSlides, generalInfo, selectedLanguage, selectedVoice, selectedModel);

      } catch (err) {
        setError('Failed to process PDF. The AI may be busy or the file may be invalid. Please try again.');
        console.error(err);
      } finally {
        setIsParsing(false);
        setLoadingText('');
      }
    }
  }, [onLectureStart, selectedLanguage, selectedVoice, selectedModel]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4">
      <h1 className="text-4xl font-bold mb-2 text-white">AI Lecture Assistant</h1>
      <p className="text-lg text-gray-400 mb-8">Upload a PDF and select your preferences to begin an interactive lecture.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8 w-full max-w-4xl">
          <div>
              <label htmlFor="language-select" className="block text-sm font-medium text-gray-400 mb-2 text-center">
                  Lecture Language
              </label>
              <div className="relative">
                  <Globe className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
                  <select
                      id="language-select"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      {SUPPORTED_LANGUES.map(lang => (
                          <option key={lang.code} value={lang.title}>{lang.title}</option>
                      ))}
                  </select>
              </div>
          </div>
          
          <div>
              <label htmlFor="voice-select" className="block text-sm font-medium text-gray-400 mb-2 text-center">
                  AI Lecturer Voice
              </label>
              <div className="relative">
                  <Volume2 className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
                  <select
                      id="voice-select"
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      {voices.map(voice => (
                          <option key={voice.name} value={voice.name}>{voice.description}</option>
                      ))}
                  </select>
              </div>
          </div>

          <div>
              <label htmlFor="model-select" className="block text-sm font-medium text-gray-400 mb-2 text-center">
                  AI Model
              </label>
              <div className="relative">
                  <Cpu className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
                  <select
                      id="model-select"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      {models.map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                  </select>
              </div>
          </div>
      </div>
      
      <div className="w-full max-w-2xl">
        <label htmlFor="pdf-upload" className="relative block w-full h-64 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 transition-colors duration-300 bg-gray-800/50">
          <div className="flex flex-col items-center justify-center h-full">
            {isParsing ? (
              <>
                <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />
                <p className="mt-4 text-lg text-gray-400 text-center">{loadingText}</p>
              </>
            ) : (
              <>
                <UploadCloudIcon className="h-16 w-16 text-gray-500" />
                <p className="mt-4 text-lg text-gray-400">
                  <span className="font-semibold text-blue-400">Click to upload</span> or drag and drop
                </p>
                <p className="text-sm text-gray-500">PDF files only</p>
              </>
            )}
          </div>
          <input id="pdf-upload" type="file" accept=".pdf" className="sr-only" onChange={handleFileChange} disabled={isParsing} />
        </label>
        {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
      </div>
    </div>
  );
};

export default IntroPage;