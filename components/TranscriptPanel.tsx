
import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';
import { X, User, Bot } from 'lucide-react';

interface TranscriptPanelProps {
  isVisible: boolean;
  onClose: () => void;
  transcript: TranscriptEntry[];
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ isVisible, onClose, transcript }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  return (
    <div
      className={`fixed top-0 right-0 h-full w-full md:w-1/3 lg:w-1/4 bg-gray-800 shadow-2xl transform transition-transform duration-300 ease-in-out z-30 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex flex-col h-full">
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
      </div>
    </div>
  );
};

export default TranscriptPanel;
