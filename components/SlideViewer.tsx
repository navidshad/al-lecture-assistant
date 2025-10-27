import React from 'react';
import { Slide, LectureSessionState } from '../types';
import { Loader2, Wifi, Power, AlertCircle } from 'lucide-react';

interface SlideViewerProps {
  slide: Slide;
  sessionState: LectureSessionState;
  error: string | null;
}

const StateOverlay: React.FC<{ icon: React.ReactNode; title: string; message: string }> = ({ icon, title, message }) => (
    <div className="absolute inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8 z-10">
        <div className="mb-4 text-blue-400">{icon}</div>
        <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
        <p className="text-gray-400 max-w-sm">{message}</p>
    </div>
);


const SlideViewer: React.FC<SlideViewerProps> = ({ slide, sessionState, error }) => {
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
