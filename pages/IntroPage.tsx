import React, { useState, useCallback } from 'react';
import { Slide } from '../types';
import { parsePdf } from '../services/pdfUtils';
import { UploadCloudIcon, Loader2, Globe, Volume2, Cpu } from 'lucide-react';

interface IntroPageProps {
  onLectureStart: (slides: Slide[], language: string, voice: string, model: string) => void;
}

const IntroPage: React.FC<IntroPageProps> = ({ onLectureStart }) => {
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-native-audio-preview-09-2025');

  const languages = [
    'English', 'Spanish', 'French', 'German', 'Japanese', 'Mandarin Chinese', 'Russian', 'Portuguese', 'Italian', 'Korean'
  ];

  const voices = [
    { name: 'Zephyr', description: 'Friendly Male Voice' },
    { name: 'Puck', description: 'Calm Male Voice' },
    { name: 'Charon', description: 'Deep Male Voice' },
    { name: 'Kore', description: 'Warm Female Voice' },
    { name: 'Fenrir', description: 'Rich Male Voice' },
  ];

  const models = [
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini 2.5 Flash Native Audio' },
    { id: 'gemini-live-2.5-flash-preview', name: 'Gemini 2.5 Flash Live' },
    { id: 'gemini-2.0-flash-live-001', name: 'Gemini 2.0 Flash Live' },
  ];

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsParsing(true);
      setError(null);
      try {
        const parsedSlides = await parsePdf(file);
        onLectureStart(parsedSlides, selectedLanguage, selectedVoice, selectedModel);
      } catch (err) {
        setError('Failed to parse PDF. Please try another file.');
        console.error(err);
      } finally {
        setIsParsing(false);
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
                      {languages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
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
                <p className="mt-4 text-lg text-gray-400">Parsing your lecture...</p>
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
