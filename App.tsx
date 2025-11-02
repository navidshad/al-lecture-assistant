import React, { useState, useCallback, useEffect } from 'react';
import { Slide, LectureSession } from './types';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ToastContainer';
import IntroPage from './pages/IntroPage';
import LecturePage from './pages/LecturePage';
import SessionsPage from './pages/SessionsPage';
import { useApiKey } from './hooks/useApiKey';
import { Loader2 } from 'lucide-react';
import { logger } from './services/logger';

const LOG_SOURCE = 'App';

type AppView = 'intro' | 'sessions' | 'lecture';

function AppContent() {
  const { apiKey, setApiKey, clearApiKey, isLoaded } = useApiKey();

  const [view, setView] = useState<AppView>('intro');
  const [activeSession, setActiveSession] = useState<LectureSession | null>(null);

  const handleNewLectureStart = useCallback((session: LectureSession) => {
    logger.log(LOG_SOURCE, 'New lecture starting.', { sessionId: session.id });
    setActiveSession(session);
    setView('lecture');
  }, []);
  
  const handleContinueSession = useCallback((session: LectureSession) => {
    logger.log(LOG_SOURCE, 'Continuing lecture session.', { sessionId: session.id });
    setActiveSession(session);
    setView('lecture');
  }, []);

  const handleEndSession = useCallback(() => {
    logger.log(LOG_SOURCE, 'Lecture ending. Clearing active session.');
    setActiveSession(null);
    setView('sessions'); // After ending, show the list of sessions
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
  
  if (view === 'lecture' && activeSession) {
    return (
      <LecturePage 
        session={activeSession}
        onEndSession={handleEndSession} 
        apiKey={apiKey}
      />
    );
  }

  if (view === 'sessions') {
      return (
          <SessionsPage
              onContinueSession={handleContinueSession}
              onNewSession={() => setView('intro')}
          />
      );
  }

  return (
    <IntroPage 
      onLectureStart={handleNewLectureStart} 
      apiKey={apiKey}
      onApiKeySave={setApiKey}
      onApiKeyRemove={clearApiKey}
      onShowSessions={() => setView('sessions')}
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