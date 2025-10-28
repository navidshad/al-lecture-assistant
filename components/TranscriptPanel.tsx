import React, { useEffect, useRef, useState } from 'react';
import { TranscriptEntry, LectureSessionState } from '../types';
import { X, User, Bot, Send } from 'lucide-react';

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

  const mobileClasses = 'bg-gray-800/50 rounded-lg border border-gray-700 transition-all duration-300 ease-in-out';
  const mobileVisibility = isVisible ? 'h-64 mt-4' : 'h-0';
  
  return (
    <div
      className={`${isDesktop ? `${desktopClasses} ${desktopVisibility}` : `${mobileClasses} ${mobileVisibility}`} overflow-hidden`}
    >
      <div className={`flex flex-col h-full overflow-hidden ${isDesktop ? 'w-96' : ''}`}>
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold">Lecture Transcript</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Close transcript"
          >
            <X className="h-6 w-6" />
          </button>
        </header>
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-6">
            {transcript.map((entry, index) => (
              <div key={index} className={`flex items-start gap-3 ${entry.speaker === 'user' ? '' : ''}`}>
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${entry.speaker === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                    {entry.speaker === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                </div>
                <div className="flex-1 bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-200">{entry.text}</p>
                </div>
              </div>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
          {transcript.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
                <p>Transcript will appear here...</p>
            </div>
          )}
        </div>
        <div className="p-2 border-t border-gray-700 flex-shrink-0">
          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isInputActive ? "Ask a question..." : "Session not active"}
              disabled={!isInputActive}
              className="flex-1 w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed"
              aria-label="Chat input"
            />
            <button
              type="submit"
              disabled={!isInputActive || !message.trim()}
              className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TranscriptPanel;
