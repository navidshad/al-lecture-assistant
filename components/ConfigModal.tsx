import React, { useState, useEffect } from 'react';
import { Volume2, X, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  voices: { name: string; description: string; }[];
  currentApiKey: string | null;
  onApiKeySave: (key: string) => void;
  onApiKeyRemove: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, selectedVoice, onVoiceChange, voices, currentApiKey, onApiKeySave, onApiKeyRemove }) => {
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setApiKeyInput('');
    }
  }, [isOpen]);

  const handleSaveKey = () => {
    if (apiKeyInput.trim()) {
      onApiKeySave(apiKeyInput.trim());
      setApiKeyInput('');
    }
  };

  const handleRemoveKey = () => {
    onApiKeyRemove();
  };

  if (!isOpen) return null;

  const maskedApiKey = currentApiKey ? `${currentApiKey.substring(0, 5)}...${currentApiKey.substring(currentApiKey.length - 4)}` : '';

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8 max-w-md w-full text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="space-y-8">
          {/* Voice Selection */}
          <div>
            <label htmlFor="voice-select-modal" className="block text-sm font-medium text-gray-400 mb-2">
              AI Lecturer Voice
            </label>
            <div className="relative">
              <Volume2 className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <select
                id="voice-select-modal"
                value={selectedVoice}
                onChange={(e) => onVoiceChange(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {voices.map(voice => (
                  <option key={voice.name} value={voice.name}>{`${voice.name} — ${voice.description}`}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* API Key Management */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Custom Gemini API Key
            </label>
            {currentApiKey ? (
              <div className="flex items-center justify-between bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="font-mono text-sm text-gray-300">{maskedApiKey}</span>
                </div>
                <button 
                  onClick={handleRemoveKey} 
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove custom API key"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-left">
                <p className="text-sm text-gray-400">
                  No custom key set. The application will use the default key from the environment.
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter new custom API key..."
                className="flex-grow w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
              />
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
             <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg flex items-start space-x-3 text-left">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-400/80">
                  Your custom API key is stored in your browser's local storage.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-right">
           <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
