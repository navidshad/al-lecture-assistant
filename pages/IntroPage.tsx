import React, { useState, useCallback, useEffect } from "react";
import { LectureSession } from "../types";
import { Globe, Cpu, Settings, History } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { VOICES } from "../constants/voices";
import { MODELS, ModelId } from "../constants/models";
import ConfigModal from "../components/ConfigModal";
import { logger } from "../services/logger";
import { sessionManager } from "../services/db";
import { useLecturePlan } from "../hooks/useLecturePlan";
import FileUploadBox from "../components/Intro/FileUploadBox";
import { useLocalStorage } from "../utils/storage";

const LOG_SOURCE = "IntroPage";

interface IntroPageProps {
  onLectureStart: (session: LectureSession) => void;
  apiKey: string | null;
  onApiKeySave: (key: string) => void;
  onApiKeyRemove: () => void;
  onShowSessions: () => void;
}

const LANGUAGE_STORAGE_KEY = "ai-lecture-assistant-language";
const VOICE_STORAGE_KEY = "ai-lecture-assistant-voice";
const PROMPT_STORAGE_KEY = "ai-lecture-assistant-custom-prompt";
const GROUP_SLIDES_STORAGE_KEY = "ai-lecture-assistant-group-slides";
const MARK_IMPORTANT_STORAGE_KEY = "ai-lecture-assistant-mark-important";

const IntroPage: React.FC<IntroPageProps> = ({
  onLectureStart,
  apiKey,
  onApiKeySave,
  onApiKeyRemove,
  onShowSessions,
}) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useLocalStorage<string>(
    LANGUAGE_STORAGE_KEY,
    "English"
  );

  const [selectedVoice, setSelectedVoice] = useLocalStorage<string>(
    VOICE_STORAGE_KEY,
    "Zephyr"
  );

  const [selectedModel, setSelectedModel] = useState<ModelId>(MODELS[0].id);

  const [userCustomPrompt, setUserCustomPrompt] = useLocalStorage<string>(
    PROMPT_STORAGE_KEY,
    ""
  );

  const [groupSlides, setGroupSlides] = useLocalStorage<boolean>(
    GROUP_SLIDES_STORAGE_KEY,
    false
  );

  const [markImportantSlides, setMarkImportantSlides] = useLocalStorage<boolean>(
    MARK_IMPORTANT_STORAGE_KEY,
    false
  );

  // Ensure language remains valid if list updates
  useEffect(() => {
    if (!SUPPORTED_LANGUAGES.some((l) => l.title === selectedLanguage)) {
      setSelectedLanguage("English");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isLoading, loadingText, error, createSessionFromPdf } =
    useLecturePlan({
      apiKey,
      selectedLanguage,
      selectedVoice,
      selectedModel,
      userCustomPrompt,
      markImportantSlides,
    });

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        logger.log(LOG_SOURCE, "File selected:", file.name);

        try {
          logger.debug(LOG_SOURCE, "Starting session creation workflow...");
          const newSession = await createSessionFromPdf(file);
          logger.log(LOG_SOURCE, "Creating new session in DB.", {
            id: newSession.id,
          });
          await sessionManager.addSession(newSession);
          logger.log(
            LOG_SOURCE,
            "Successfully processed file. Starting lecture."
          );
          onLectureStart(newSession);
        } catch (err) {
          logger.error(LOG_SOURCE, "Failed to process PDF.", err as any);
          console.error(err);
        }
      }
    },
    [onLectureStart, createSessionFromPdf]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4 relative">
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <button
          onClick={onShowSessions}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
          title="View Saved Sessions"
        >
          <History className="h-5 w-5" />
          <span>My Sessions</span>
        </button>
        <button
          onClick={() => setIsConfigOpen(true)}
          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          title="Settings"
        >
          <Settings className="h-6 w-6" />
        </button>
      </div>

      <h1 className="text-4xl font-bold mb-2 text-white">
        AI Lecture Assistant
      </h1>
      <p className="text-lg text-gray-400 mb-8">
        Upload a PDF and select your preferences to begin an interactive
        lecture.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 w-full max-w-2xl">
        <div>
          <label
            htmlFor="language-select"
            className="block text-sm font-medium text-gray-400 mb-2 text-center"
          >
            Lecture Language
          </label>
          <div className="relative">
            <Globe className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
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
            htmlFor="model-select"
            className="block text-sm font-medium text-gray-400 mb-2 text-center"
          >
            AI Model
          </label>
          <div className="relative">
            <Cpu className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 py-2.5 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mb-8">
        <label
          htmlFor="custom-prompt"
          className="block text-sm font-medium text-gray-400 mb-2 text-center"
        >
          Custom Lecture Instructions (optional)
        </label>
        <textarea
          id="custom-prompt"
          value={userCustomPrompt}
          onChange={(e) => setUserCustomPrompt(e.target.value)}
          placeholder="E.g., focus on real-world examples, emphasize definitions, avoid heavy math, target beginners..."
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[96px] resize-y"
        />
      </div>

      <div className="w-full max-w-2xl mb-4">
        <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={groupSlides}
            onChange={(e) => setGroupSlides(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Group slides by AI (UI only)</span>
        </label>
      </div>

      <div className="w-full max-w-2xl mb-4">
        <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={markImportantSlides}
            onChange={(e) => setMarkImportantSlides(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Mark important slides by AI (UI only)</span>
        </label>
      </div>

      <div className="w-full max-w-2xl">
        <FileUploadBox
          isLoading={isLoading}
          loadingText={loadingText}
          disabled={!apiKey}
          onFileChange={handleFileChange}
          onOpenSettings={() => setIsConfigOpen(true)}
        />
        {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
      </div>

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        voices={VOICES}
        currentApiKey={apiKey}
        onApiKeySave={onApiKeySave}
        onApiKeyRemove={onApiKeyRemove}
      />
    </div>
  );
};

export default IntroPage;
