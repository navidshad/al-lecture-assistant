
import React, { useState } from 'react';
import { KeyRound, AlertTriangle } from 'lucide-react';

interface ApiKeyModalProps {
  onApiKeySubmit: (apiKey: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onApiKeySubmit }) => {
  const [key, setKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onApiKeySubmit(key.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center text-white">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-600/20 mb-6 border border-blue-500/30">
          <KeyRound className="h-8 w-8 text-blue-400" />
        </div>
        <h2 className="text-3xl font-bold mb-3">Enter Your Gemini API Key</h2>
        <p className="text-gray-400 mb-6">
          To use the AI Lecture Assistant, please provide your Gemini API key.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Your Gemini API Key"
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!key.trim()}
            className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            Save and Start
          </button>
        </form>
        <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg flex items-start space-x-3 text-left">
          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-300">Security Notice</h4>
            <p className="text-sm text-yellow-400/80">
              Your API key will be stored in your browser's local storage. Do not use this application on a shared or public computer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
