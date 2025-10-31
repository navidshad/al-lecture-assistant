import React from 'react';
import { Slide, LectureSessionState } from '../types';
import { Loader2, Wifi, Power, WifiOff, RefreshCw } from 'lucide-react';

interface SlideViewerProps {
  slide: Slide;
  sessionState: LectureSessionState;
  error: string | null;
  onReconnect?: () => void;
}

const StateOverlay: React.FC<{ icon: React.ReactNode; title: string; message: string }> = ({ icon, title, message }) => (
    <div className="absolute inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8 z-10">
        <div className="mb-4 text-blue-400">{icon}</div>
        <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
        <p className="text-gray-400 max-w-sm">{message}</p>
    </div>
);


const SlideViewer: React.FC<SlideViewerProps> = ({ slide, sessionState, error, onReconnect }) => {
  const renderOverlay = () => {
    switch (sessionState) {
      case LectureSessionState.CONNECTING:
        return <StateOverlay icon={<Loader2 className="h-16 w-16 animate-spin" />} title="Connecting..." message="Initializing AI lecturer. This may take a moment." />;
      case LectureSessionState.LECTURING:
      case LectureSessionState.LISTENING:
      case LectureSessionState.ERROR: // Error is now handled by a toast notification, so no overlay is needed.
        return null; // No overlay when active or on error
      case LectureSessionState.ENDED:
        return <StateOverlay icon={<Power className="h-16 w-16" />} title="Session Ended" message="You have ended the lecture session." />;
      case LectureSessionState.DISCONNECTED:
        return (
            <div className="absolute inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8 z-10">
                <div className="mb-4 text-yellow-400"><WifiOff className="h-16 w-16" /></div>
                <h3 className="text-2xl font-bold text-white mb-2">Connection Lost</h3>
                <p className="text-gray-400 max-w-sm mb-6">The connection to the AI lecturer was interrupted.</p>
                <button
                  onClick={onReconnect}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg flex items-center gap-2"
                >
                  <RefreshCw className="h-5 w-5" />
                  Reconnect
                </button>
            </div>
        );
      default:
         return <StateOverlay icon={<Wifi className="h-16 w-16" />} title="Ready to Start" message="The AI lecturer is ready. The session will begin shortly." />;
    }
  };

  return (
    <div className="relative w-full h-full bg-black rounded-lg shadow-2xl flex items-center justify-center overflow-hidden border border-gray-700">
      <img
        src={slide.imageDataUrl}
        alt={`Slide ${slide.pageNumber}`}
        className="object-contain w-full h-full"
      />
      {renderOverlay()}
    </div>
  );
};

export default SlideViewer;
