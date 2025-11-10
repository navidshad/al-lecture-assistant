import React, { useEffect, useRef, useState } from 'react';
import { TranscriptEntry, LectureSessionState } from '../types';
import { User, Bot, Send } from 'lucide-react';

interface TranscriptPanelProps {
  isVisible: boolean;
  onClose: () => void;
  transcript: TranscriptEntry[];
  isDesktop?: boolean;
  onSendMessage: (message: string) => void;
  sessionState: LectureSessionState;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ isVisible, onClose, transcript, isDesktop = false, onSendMessage, sessionState }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const isInputActive = [
    LectureSessionState.READY,
    LectureSessionState.LECTURING,
    LectureSessionState.LISTENING,
  ].includes(sessionState);

  const desktopClasses = 'h-full bg-gray-800/50 border-r border-gray-700 transition-all duration-300 ease-in-out flex-shrink-0';
  const desktopVisibility = isVisible ? 'w-96' : 'w-0';

  // Removed border, background, and margin for mobile to make it frameless
  const mobileClasses = 'transition-all duration-300 ease-in-out';
  const mobileVisibility = isVisible ? 'h-64' : 'h-0';
  
  return (
    <div
      className={`${isDesktop ? `${desktopClasses} ${desktopVisibility}` : `${mobileClasses} ${mobileVisibility}`} overflow-hidden`}
    >
      <div className={`flex flex-col h-full overflow-hidden ${isDesktop ? 'w-96' : ''}`}>
        {isDesktop && (
            <header className={`flex items-center justify-between border-b border-gray-700 flex-shrink-0 p-4`}>
                <h2 className={`text-xl font-semibold`}>Lecture Transcript</h2>
            </header>
        )}
        <div className={`flex-1 overflow-y-auto ${isDesktop ? 'p-4' : 'p-2'}`}>
          <div className={`${isDesktop ? 'space-y-6' : 'space-y-3'}`}>
            {transcript.map((entry, index) => (
              <div key={index} className={`flex items-start ${isDesktop ? 'gap-3' : 'gap-2'}`}>
                <div className={`flex-shrink-0 rounded-full flex items-center justify-center ${isDesktop ? 'h-8 w-8' : 'h-6 w-6'} ${entry.speaker === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                  {entry.speaker === 'user' ? <User className={isDesktop ? 'h-5 w-5' : 'h-3 w-3'} /> : <Bot className={isDesktop ? 'h-5 w-5' : 'h-3 w-3'} />}
                </div>
                <div className={`flex-1 bg-gray-700 rounded-lg ${isDesktop ? 'p-3' : 'p-2'}`}>
                  {entry.speaker === 'ai' && entry.slideNumber != null && (
                    <div className="mb-1">
                      <span className={`${isDesktop ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]'} inline-flex items-center rounded-md bg-gray-600 text-gray-200`}>
                        Slide {entry.slideNumber}
                      </span>
                    </div>
                  )}
                  <p className={`text-gray-200 ${isDesktop ? '' : 'text-xs'}`}>{entry.text}</p>
                </div>
              </div>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
          {transcript.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
                <p className={isDesktop ? '' : 'text-sm'}>Transcript will appear here...</p>
            </div>
          )}
        </div>
        <div className={`${isDesktop ? 'p-4' : 'p-2 pt-0'} flex-shrink-0 flex items-center`}>
          <form onSubmit={handleFormSubmit} className="flex items-center justify-between mb-0 w-full gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isInputActive ? "Ask a question..." : "Session not active"}
              disabled={!isInputActive}
              className={`flex-1 w-full bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed ${isDesktop ? 'px-4 py-2' : 'px-3 py-1.5 text-xs'}`}
              aria-label="Chat input"
            />
            <button
              type="submit"
              disabled={!isInputActive || !message.trim()}
              className={`flex-shrink-0 flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed ${isDesktop ? 'h-10 w-10' : 'h-8 w-8'}`}
              aria-label="Send message"
            >
              <Send className={isDesktop ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TranscriptPanel;