import React, { useEffect, useState } from "react";
import { X, Globe, Volume2 } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { VOICES } from "../constants/voices";

interface ResumeConfigModalProps {
  isOpen: boolean;
  sessionFileName?: string;
  defaultLanguage: string;
  defaultVoice: string;
  defaultPrompt: string;
  onClose: () => void;
  onConfirm: (config: {
    language: string;
    voice: string;
    prompt: string;
  }) => void;
}

const ResumeConfigModal: React.FC<ResumeConfigModalProps> = ({
  isOpen,
  sessionFileName,
  defaultLanguage,
  defaultVoice,
  defaultPrompt,
  onClose,
  onConfirm,
}) => {
  const [language, setLanguage] = useState(defaultLanguage);
  const [voice, setVoice] = useState(defaultVoice);
  const [prompt, setPrompt] = useState(defaultPrompt);

  useEffect(() => {
    if (isOpen) {
      setLanguage(defaultLanguage);
      setVoice(defaultVoice);
      setPrompt(defaultPrompt);
    }
  }, [isOpen, defaultLanguage, defaultVoice, defaultPrompt]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-6 w-full max-w-xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-semibold">Resume Lecture</h3>
            {sessionFileName && (
              <p className="text-sm text-gray-400 mt-1 truncate">
                {sessionFileName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label
              htmlFor="resume-language-select"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              Lecture Language
            </label>
            <div className="relative">
              <Globe className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <select
                id="resume-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.title}>
                    {lang.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="resume-voice-select"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              AI Lecturer Voice
            </label>
            <div className="relative">
              <Volume2 className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <select
                id="resume-voice-select"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {VOICES.map((v) => (
                  <option key={v.name} value={v.name}>
                    {`${v.name} — ${v.description}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="resume-custom-prompt"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              Custom Lecture Instructions (optional)
            </label>
            <textarea
              id="resume-custom-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., focus on real-world examples, emphasize definitions, avoid heavy math, target beginners..."
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[96px] resize-y"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ language, voice, prompt })}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResumeConfigModal;
