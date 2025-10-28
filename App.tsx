import React, { useState, useCallback } from 'react';
import { Slide } from './types';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ToastContainer';
import IntroPage from './pages/IntroPage';
import LecturePage from './pages/LecturePage';

function AppContent() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [lectureConfig, setLectureConfig] = useState({
    language: 'English',
    voice: 'Zephyr',
    model: 'gemini-2.5-flash-native-audio-preview-09-2025'
  });

  const handleLectureStart = useCallback((parsedSlides: Slide[], language: string, voice: string, model: string) => {
    setSlides(parsedSlides);
    setLectureConfig({ language, voice, model });
  }, []);

  const handleEndSession = useCallback(() => {
    setSlides([]);
  }, []);

  if (slides.length === 0) {
    return (
      <IntroPage onLectureStart={handleLectureStart} />
    );
  }

  return (
    <LecturePage 
      slides={slides} 
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
