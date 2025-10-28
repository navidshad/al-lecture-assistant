import React, { useState, useCallback } from 'react';
import { Slide } from './types';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ToastContainer';
import IntroPage from './pages/IntroPage';
import LecturePage from './pages/LecturePage';

function AppContent() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [generalInfo, setGeneralInfo] = useState('');
  const [lectureConfig, setLectureConfig] = useState({
    language: 'English',
    voice: 'Zephyr',
    model: 'gemini-2.5-flash-native-audio-preview-09-2025'
  });

  const handleLectureStart = useCallback((parsedSlides: Slide[], generalInfo: string, language: string, voice: string, model: string) => {
    setSlides(parsedSlides);
    setGeneralInfo(generalInfo);
    setLectureConfig({ language, voice, model });
  }, []);

  const handleEndSession = useCallback(() => {
    setSlides([]);
    setGeneralInfo('');
  }, []);

  if (slides.length === 0) {
    return (
      <IntroPage onLectureStart={handleLectureStart} />
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