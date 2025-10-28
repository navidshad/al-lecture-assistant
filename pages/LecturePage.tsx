import React, { useState, useCallback, useEffect } from 'react';
import { Slide, TranscriptEntry } from '../types';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { useToast } from '../hooks/useToast';
import SlideViewer from '../components/SlideViewer';
import Controls from '../components/Controls';
import TranscriptPanel from '../components/TranscriptPanel';
import { Power, PlayCircle } from 'lucide-react';

interface LecturePageProps {
  slides: Slide[];
  onEndSession: () => void;
  selectedLanguage: string;
  selectedVoice: string;
  selectedModel: string;
}

const LecturePage: React.FC<LecturePageProps> = ({ slides, onEndSession, selectedLanguage, selectedVoice, selectedModel }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isTranscriptVisible, setIsTranscriptVisible] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [hasLectureStarted, setHasLectureStarted] = useState(false);
  const { showToast } = useToast();
  
  const handleSlideChangeFromAI = useCallback((slideNumber: number) => {
    const newIndex = slideNumber - 1;
    if (newIndex >= 0 && newIndex < slides.length) {
      setCurrentSlideIndex(newIndex);
    } else {
      console.warn(`AI tried to switch to an invalid slide number: ${slideNumber}`);
    }
  }, [slides.length]);

  const { sessionState, startLecture, replay, next, previous, end, error, goToSlide } = useGeminiLive({
    slides,
    setTranscript,
    isMuted,
    selectedLanguage,
    selectedVoice,
    selectedModel,
    onSlideChange: handleSlideChangeFromAI,
  });

  useEffect(() => {
    if (error) {
      showToast(error, 'error');
    }
  }, [error, showToast]);
  
  const handleStartLecture = () => {
    setHasLectureStarted(true);
    startLecture();
  };

  const handleNext = useCallback(() => {
    if (currentSlideIndex < slides.length - 1) {
      next();
    }
  }, [currentSlideIndex, slides.length, next]);

  const handlePrevious = useCallback(() => {
    if (currentSlideIndex > 0) {
      previous();
    }
  }, [currentSlideIndex, previous]);

  const handleSelectSlide = useCallback((index: number) => {
    if (index !== currentSlideIndex) {
      goToSlide(index + 1);
    }
  }, [currentSlideIndex, goToSlide]);
  
  const handleEndSession = () => {
    end();
    onEndSession();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <header className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-3 flex items-center justify-between z-20">
        <h1 className="text-xl font-bold">AI Lecture Assistant</h1>
        <div className="text-sm text-gray-400">
          Slide {currentSlideIndex + 1} of {slides.length}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden">
          <SlideViewer 
            slide={slides[currentSlideIndex]} 
            sessionState={sessionState}
            error={error}
          />
        </main>

        <aside className="w-48 md:w-64 bg-gray-800/50 border-l border-gray-700 p-2 flex flex-col overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-400 p-2">Slides</h2>
          <div className="flex-1 space-y-2">
            {slides.map((slide, index) => (
              <div
                key={slide.pageNumber}
                onClick={() => handleSelectSlide(index)}
                className={`rounded-md overflow-hidden cursor-pointer border-2 transition-all ${
                  index === currentSlideIndex ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-500'
                }`}
              >
                <img src={slide.imageDataUrl} alt={`Slide ${slide.pageNumber}`} className="w-full h-auto" />
              </div>
            ))}
          </div>
        </aside>
        
        {!hasLectureStarted && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-30">
            <button
              onClick={handleStartLecture}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105 shadow-lg flex items-center gap-3"
              aria-label="Start Lecture"
            >
              <PlayCircle className="h-8 w-8" />
              Start Lecture
            </button>
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-t border-gray-700 p-4 z-20">
        {hasLectureStarted ? (
          <Controls
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted(prev => !prev)}
            onReplay={replay}
            onNext={handleNext}
            onPrevious={handlePrevious}
            isNextDisabled={currentSlideIndex >= slides.length - 1}
            isPreviousDisabled={currentSlideIndex <= 0}
            onTranscriptToggle={() => setIsTranscriptVisible(prev => !prev)}
            onEndSession={handleEndSession}
          />
        ) : (
          <div className="flex items-center justify-end h-16">
            <button
              onClick={handleEndSession}
              title="End Session"
              className="flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 bg-red-800/80 text-red-300 hover:bg-red-700"
            >
              <Power className="h-6 w-6" />
            </button>
          </div>
        )}
      </footer>
      <TranscriptPanel 
        isVisible={isTranscriptVisible} 
        onClose={() => setIsTranscriptVisible(false)}
        transcript={transcript}
      />
    </div>
  );
};

export default LecturePage;