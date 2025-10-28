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
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [hasLectureStarted, setHasLectureStarted] = useState(false);
  
  const [isTranscriptVisible, setIsTranscriptVisible] = useState(false);
  const [isSlidesVisible, setIsSlidesVisible] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    const checkDesktop = () => {
      if (window.innerWidth >= 768) {
        setIsSlidesVisible(true);
      } else {
        setIsSlidesVisible(false);
      }
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  const handleTranscriptToggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsTranscriptVisible(prev => {
        if (!prev) setIsSlidesVisible(false);
        return !prev;
      });
    } else {
      setIsTranscriptVisible(prev => !prev);
    }
  }, []);

  const handleSlidesToggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsSlidesVisible(prev => {
        if (!prev) setIsTranscriptVisible(false);
        return !prev;
      });
    } else {
      setIsSlidesVisible(prev => !prev);
    }
  }, []);
  
  const handleSlideChangeFromAI = useCallback((slideNumber: number) => {
    const newIndex = slideNumber - 1;
    if (newIndex >= 0 && newIndex < slides.length) {
      setCurrentSlideIndex(newIndex);
    } else {
      console.warn(`AI tried to switch to an invalid slide number: ${slideNumber}`);
    }
  }, [slides.length]);

  const { sessionState, startLecture, replay, next, previous, end, error, goToSlide, sendTextMessage } = useGeminiLive({
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
      const newIndex = currentSlideIndex + 1;
      setCurrentSlideIndex(newIndex);
      goToSlide(newIndex + 1);
    }
  }, [currentSlideIndex, slides.length, goToSlide]);

  const handlePrevious = useCallback(() => {
    if (currentSlideIndex > 0) {
      const newIndex = currentSlideIndex - 1;
      setCurrentSlideIndex(newIndex);
      goToSlide(newIndex + 1);
    }
  }, [currentSlideIndex, goToSlide]);

  const handleSelectSlide = useCallback((index: number) => {
    if (index !== currentSlideIndex) {
      setCurrentSlideIndex(index);
      goToSlide(index + 1);
    }
  }, [currentSlideIndex, goToSlide]);

  const handleSendMessage = useCallback((message: string) => {
    if (!sendTextMessage) return;
    
    // Add user message to transcript immediately
    setTranscript(prev => [...prev, { speaker: 'user', text: message }]);
    
    // Send message to AI
    sendTextMessage(message);
  }, [sendTextMessage]);
  
  const handleEndSession = () => {
    end();
    onEndSession();
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Desktop Left Transcript Panel */}
      <div className="hidden md:flex">
        <TranscriptPanel
          isVisible={isTranscriptVisible}
          onClose={handleTranscriptToggle}
          transcript={transcript}
          isDesktop={true}
          onSendMessage={handleSendMessage}
          sessionState={sessionState}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex items-center justify-between z-20">
          <h1 className="text-xl font-bold">AI Lecture Assistant</h1>
          <div className="text-sm text-gray-400">
            Slide {currentSlideIndex + 1} of {slides.length}
          </div>
        </header>

        <div className="flex-1 flex flex-col relative overflow-hidden">
          <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden">
            <div className="flex-1 min-h-0">
              <SlideViewer 
                slide={slides[currentSlideIndex]} 
                sessionState={sessionState}
                error={error}
              />
            </div>

            {/* Mobile Transcript Panel */}
            <div className="md:hidden">
              <TranscriptPanel
                isVisible={isTranscriptVisible}
                onClose={handleTranscriptToggle}
                transcript={transcript}
                isDesktop={false}
                onSendMessage={handleSendMessage}
                sessionState={sessionState}
              />
            </div>
            
            {/* Mobile Slides Overview Panel */}
            <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${isSlidesVisible ? 'h-36 mt-4' : 'h-0'}`}>
              <div className="h-full bg-gray-800/50 rounded-lg border border-gray-700 p-2 overflow-x-auto flex items-center space-x-2">
                {slides.map((slide, index) => (
                  <div
                    key={slide.pageNumber}
                    onClick={() => handleSelectSlide(index)}
                    className={`flex-shrink-0 h-full aspect-[4/3] rounded-md overflow-hidden cursor-pointer border-2 transition-all ${
                      index === currentSlideIndex ? 'border-blue-500' : 'border-transparent hover:border-gray-500'
                    }`}
                  >
                    <img src={slide.imageDataUrl} alt={`Slide ${slide.pageNumber}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </main>
          
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
              onTranscriptToggle={handleTranscriptToggle}
              onSlidesToggle={handleSlidesToggle}
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
      </div>
      
      {/* Desktop Right Slides Panel */}
      <aside className={`hidden md:flex flex-col bg-gray-800/50 border-l border-gray-700 transition-all duration-300 ease-in-out ${isSlidesVisible ? 'w-48 md:w-64 p-2' : 'w-0'}`}>
        {isSlidesVisible && (
          <>
            <h2 className="text-sm font-semibold text-gray-400 p-2 flex-shrink-0">Slides</h2>
            <div className="flex-1 space-y-2 overflow-y-auto">
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
          </>
        )}
      </aside>
    </div>
  );
};

export default LecturePage;