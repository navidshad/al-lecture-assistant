import React, { useState, useCallback, useEffect } from 'react';
import { Slide } from './types';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ToastContainer';
import IntroPage from './pages/IntroPage';
import LecturePage from './pages/LecturePage';
import { useApiKey } from './hooks/useApiKey';
import { Loader2 } from 'lucide-react';
import { logger } from './services/logger';

const LOG_SOURCE = 'App';

function AppContent() {
  const { apiKey, setApiKey, clearApiKey, isLoaded } = useApiKey();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [generalInfo, setGeneralInfo] = useState('');
  const [lectureConfig, setLectureConfig] = useState({
    language: 'English',
    voice: 'Zephyr',
    model: 'gemini-2.5-flash-native-audio-preview-09-2025'
  });

  const handleLectureStart = useCallback((parsedSlides: Slide[], generalInfo: string, language: string, voice: string, model: string) => {
    logger.log(LOG_SOURCE, 'Lecture starting. Setting state for lecture page.');
    setSlides(parsedSlides);
    setGeneralInfo(generalInfo);
    setLectureConfig({ language, voice, model });
  }, []);

  const handleEndSession = useCallback(() => {
    logger.log(LOG_SOURCE, 'Lecture ending. Clearing state.');
    setSlides([]);
    setGeneralInfo('');
  }, []);

  useEffect(() => {
    logger.log(LOG_SOURCE, 'AppContent mounted.');
  }, []);

  if (!isLoaded) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <p className="mt-4 text-lg">Loading settings...</p>
        </div>
    );
  }

  if (slides.length === 0) {
    return (
      <IntroPage 
        onLectureStart={handleLectureStart} 
        apiKey={apiKey}
        onApiKeySave={setApiKey}
        onApiKeyRemove={clearApiKey}
      />
    );
  }

  return (
    <LecturePage 
      slides={slides} 
      generalInfo={generalInfo}
      onEndSession={handleEndSession} 
      selectedLanguage={lectureConfig.language} 
      selectedVoice={lectureConfig.voice} 
      selectedModel={lectureConfig.model} 
      apiKey={apiKey}
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
      <ToastContainer />
    </ToastProvider>
  );
}
