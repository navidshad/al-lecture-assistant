import React, { useState, useCallback, useEffect } from 'react';
import { Slide, TranscriptEntry, LectureSessionState, CanvasBlock, LectureSession } from '../types';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { useToast } from '../hooks/useToast';
import { sessionManager } from '../services/db';
import SlideViewer from '../components/SlideViewer';
import CanvasViewer from '../components/CanvasViewer';
import Controls from '../components/Controls';
import TranscriptPanel from '../components/TranscriptPanel';
import { Power, PlayCircle } from 'lucide-react';
import { logger } from '../services/logger';

const LOG_SOURCE = 'LecturePage';

interface LecturePageProps {
  session: LectureSession;
  onEndSession: () => void;
  apiKey: string | null;
}

const LecturePage: React.FC<LecturePageProps> = ({ session, onEndSession, apiKey }) => {
  const [currentSlideIndex, _setCurrentSlideIndex] = useState(session.currentSlideIndex);
  const [isMuted, setIsMuted] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(session.transcript);
  const [hasLectureStarted, setHasLectureStarted] = useState(session.transcript.length > 0);
  
  const [isTranscriptVisible, setIsTranscriptVisible] = useState(false);
  const [isSlidesVisible, setIsSlidesVisible] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'slide' | 'canvas'>('slide');
  const [canvasContent, setCanvasContent] = useState<CanvasBlock[]>([]);

  const { showToast } = useToast();

  const saveSessionState = useCallback(async () => {
    logger.debug(LOG_SOURCE, 'Saving session state to DB.');
    const updatedSession: LectureSession = {
        ...session,
        transcript: transcript,
        currentSlideIndex: currentSlideIndex,
    };
    try {
        await sessionManager.updateSession(updatedSession);
    } catch (e) {
        logger.error(LOG_SOURCE, 'Failed to save session state', e);
    }
  }, [session, transcript, currentSlideIndex]);

  useEffect(() => {
    // Debounce saving the session state. This runs whenever the saveSessionState
    // function is recreated (i.e., when its dependencies change).
    const debounceTimeout = setTimeout(saveSessionState, 2000);
    return () => clearTimeout(debounceTimeout);
  }, [saveSessionState]);


  const setCurrentSlideIndex = (updater: React.SetStateAction<number>) => {
    _setCurrentSlideIndex(prevIndex => {
        const newIndex = typeof updater === 'function' ? updater(prevIndex) : updater;
        if (prevIndex !== newIndex) {
            logger.debug(LOG_SOURCE, `Slide index changing from ${prevIndex} to ${newIndex}`);
        }
        return newIndex;
    });
  };

  useEffect(() => {
    logger.log(LOG_SOURCE, 'Component mounted with session:', { sessionId: session.id });
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
  }, [session.id]);

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
    logger.log(LOG_SOURCE, `AI requested slide change to ${slideNumber}`);
    const newIndex = slideNumber - 1;
    if (newIndex >= 0 && newIndex < session.slides.length) {
      setCurrentSlideIndex(newIndex);
    } else {
      logger.warn(LOG_SOURCE, `AI tried to switch to an invalid slide number: ${slideNumber}`);
    }
  }, [session.slides.length]);

  const handleRenderCanvas = useCallback((contentBlocks: CanvasBlock[]) => {
    logger.log(LOG_SOURCE, 'Received request to render canvas content.');
    setCanvasContent(contentBlocks);
    setActiveTab('canvas');
  }, []);

  const { sessionState, startLecture, replay, next, previous, end, error, goToSlide, sendTextMessage, sendSlideImageContext } = useGeminiLive({
    slides: session.slides,
    generalInfo: session.generalInfo,
    transcript,
    setTranscript,
    isMuted,
    selectedLanguage: session.lectureConfig.language,
    selectedVoice: session.lectureConfig.voice,
    selectedModel: session.lectureConfig.model,
    onSlideChange: handleSlideChangeFromAI,
    onRenderCanvas: handleRenderCanvas,
    apiKey,
    currentSlideIndex,
  });

  useEffect(() => {
    if (error) {
      logger.error(LOG_SOURCE, 'Received error from useGeminiLive hook:', error);
      showToast(error, 'error');
    }
  }, [error, showToast]);
  
  // Send the image context whenever the slide changes, but only if the lecture is active.
  useEffect(() => {
    if (
      hasLectureStarted &&
      sendSlideImageContext &&
      session.slides[currentSlideIndex] &&
      (sessionState === LectureSessionState.LECTURING || sessionState === LectureSessionState.LISTENING || sessionState === LectureSessionState.READY)
    ) {
      logger.debug(LOG_SOURCE, `Slide changed to ${currentSlideIndex + 1}. Sending image context.`);
      sendSlideImageContext(session.slides[currentSlideIndex]);
    }
  }, [currentSlideIndex, hasLectureStarted, sendSlideImageContext, session.slides, sessionState]);
  
  // Reset to slide view whenever the slide changes
  useEffect(() => {
      logger.debug(LOG_SOURCE, `Slide index changed to ${currentSlideIndex}, resetting tab to 'slide'.`);
      setActiveTab('slide');
  }, [currentSlideIndex]);


  const handleStartLecture = () => {
    logger.log(LOG_SOURCE, 'handleStartLecture called for a new session.');
    setHasLectureStarted(true);
    startLecture();
  };

  useEffect(() => {
    if (session.transcript.length > 0) {
        logger.log(LOG_SOURCE, 'Continuing session, calling startLecture automatically.');
        startLecture();
    }
    // This effect should only run once on mount for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReconnect = useCallback(() => {
    logger.log(LOG_SOURCE, 'handleReconnect called.');
    startLecture();
  }, [startLecture]);

  const handleNext = useCallback(() => {
    logger.debug(LOG_SOURCE, 'handleNext called.');
    if (currentSlideIndex < session.slides.length - 1) {
      // Optimistically update UI, AI will confirm via function call
      setCurrentSlideIndex(prev => prev + 1);
      next();
    }
  }, [currentSlideIndex, session.slides.length, next]);

  const handlePrevious = useCallback(() => {
    logger.debug(LOG_SOURCE, 'handlePrevious called.');
    if (currentSlideIndex > 0) {
      // Optimistically update UI, AI will confirm via function call
      setCurrentSlideIndex(prev => prev - 1);
      previous();
    }
  }, [currentSlideIndex, previous]);

  const handleSelectSlide = useCallback((index: number) => {
    logger.debug(LOG_SOURCE, `handleSelectSlide called for index ${index}.`);
    if (index !== currentSlideIndex) {
      setCurrentSlideIndex(index);
      goToSlide(index + 1);
    }
  }, [currentSlideIndex, goToSlide]);

  const handleSendMessage = useCallback((message: string) => {
    logger.debug(LOG_SOURCE, 'handleSendMessage called.');
    if (!sendTextMessage) return;
    
    // Add user message to transcript immediately
    setTranscript(prev => [...prev, { speaker: 'user', text: message }]);
    
    // Send message to AI
    sendTextMessage(message);
  }, [sendTextMessage]);
  
  const handleEndSession = useCallback(async () => {
    logger.log(LOG_SOURCE, 'handleEndSession called. Forcing final save.');
    await saveSessionState();
    end();
    onEndSession();
  }, [saveSessionState, end, onEndSession]);

  const handleDownloadTranscript = useCallback(() => {
    if (transcript.length === 0 && !session.generalInfo) return;

    const header = `AI Lecture Transcript\n=====================\n\n`;
    const overview = `Presentation Overview:\n${session.generalInfo}\n\n---------------------\nConversation History:\n---------------------\n\n`;
    
    const conversation = transcript
        .map(entry => `${entry.speaker === 'user' ? 'User' : 'AI Lecturer'}: ${entry.text}`)
        .join('\n\n');

    const fileContent = header + overview + conversation;

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const baseFileName = session.fileName.replace(/\.pdf$/i, '');
    link.download = `${baseFileName}-transcript.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logger.log(LOG_SOURCE, 'Transcript downloaded.');
  }, [transcript, session.generalInfo, session.fileName]);
  
  const tabButtonClasses = (tabName: 'slide' | 'canvas') => 
    `px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none ${
      activeTab === tabName 
        ? 'text-blue-400 border-b-2 border-blue-400' 
        : 'text-gray-400 border-b-2 border-transparent hover:bg-gray-700/50 hover:text-gray-200'
    }`;

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
          <h1 className="text-xl font-bold truncate pr-4" title={session.fileName}>{session.fileName}</h1>
          <div className="text-sm text-gray-400 flex-shrink-0">
            Slide {currentSlideIndex + 1} of {session.slides.length}
          </div>
        </header>

        <div className="flex-1 flex flex-col relative overflow-hidden">
          <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden">
             <div className="flex-1 min-h-0 flex flex-col">
              {/* Tab buttons */}
              <div className="flex-shrink-0">
                <div className="border-b border-gray-700">
                  <nav className="-mb-px flex space-x-2" aria-label="Tabs">
                    <button onClick={() => setActiveTab('slide')} className={tabButtonClasses('slide')}>
                      Slide
                    </button>
                    <button onClick={() => setActiveTab('canvas')} className={tabButtonClasses('canvas')}>
                      Canvas
                    </button>
                  </nav>
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 pt-4">
                <div className={`${activeTab === 'slide' ? 'block' : 'hidden'} w-full h-full`}>
                   <SlideViewer 
                    slide={session.slides[currentSlideIndex]} 
                    sessionState={sessionState}
                    error={error}
                    onReconnect={handleReconnect}
                  />
                </div>
                <div className={`${activeTab === 'canvas' ? 'block' : 'hidden'} w-full h-full`}>
                    <CanvasViewer content={canvasContent} />
                </div>
              </div>
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
                {session.slides.map((slide, index) => (
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
              isNextDisabled={currentSlideIndex >= session.slides.length - 1}
              isPreviousDisabled={currentSlideIndex <= 0}
              onTranscriptToggle={handleTranscriptToggle}
              onSlidesToggle={handleSlidesToggle}
              onDownloadTranscript={handleDownloadTranscript}
              isTranscriptEmpty={transcript.length === 0}
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
              {session.slides.map((slide, index) => (
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