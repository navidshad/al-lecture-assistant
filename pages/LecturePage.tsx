import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Slide,
  TranscriptEntry,
  LectureSessionState,
  CanvasBlock,
  LectureSession,
  SlideGroup,
  ChatAttachment,
} from "../types";
import { useGeminiLive } from "../hooks/useGeminiLive";
import { useToast } from "../hooks/useToast";
import { sessionManager } from "../services/db";
import SlideViewer from "../components/SlideViewer";
import CanvasViewer from "../components/CanvasViewer";
import Controls from "../components/Controls";
import TranscriptPanel from "../components/TranscriptPanel";
import { Power, PlayCircle } from "lucide-react";
import { logger } from "../services/logger";
import TopBar from "../components/Lecture/TopBar";
import TabNav from "../components/Lecture/TabNav";
import Toolbox from "../components/Lecture/Toolbox";
import SlidesThumbStrip from "../components/Lecture/SlidesThumbStrip";
import { useSessionPersistence } from "../hooks/useSessionPersistence";
import GroupedSlidesThumbStrip from "../components/Lecture/GroupedSlidesThumbStrip";
import { groupSlidesByAI } from "../services/slideGrouper";
import { useLocalStorage } from "../utils/storage";
import { useAttachments } from "../hooks/useAttachments";

const LOG_SOURCE = "LecturePage";

interface LecturePageProps {
  session: LectureSession;
  onEndSession: () => void;
  apiKey: string | null;
}

const LecturePage: React.FC<LecturePageProps> = ({
  session,
  onEndSession,
  apiKey,
}) => {
  const [slides, setSlides] = useState<Slide[]>(session.slides);
  const [currentSlideIndex, _setCurrentSlideIndex] = useState(
    session.currentSlideIndex
  );
  const [isMuted, setIsMuted] = useState(true);
  const autoMuteTimerRef = useRef<number | null>(null);
  const lastTranscriptLengthRef = useRef<number>(session.transcript.length);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(
    session.transcript
  );
  const [hasLectureStarted, setHasLectureStarted] = useState(
    session.transcript.length > 0
  );

  const [isTranscriptVisible, setIsTranscriptVisible] = useState(false);
  const [isSlidesVisible, setIsSlidesVisible] = useState(false);

  const [activeTab, setActiveTab] = useState<"slide" | "canvas">("slide");
  const lastFixSignatureRef = useRef<string | null>(null);
  const [slideGroups, setSlideGroups] = useState<SlideGroup[] | null>(
    session.slideGroups ?? null
  );
  const [isGroupingLoading, setIsGroupingLoading] = useState(false);
  const [isGroupingEnabled] = useLocalStorage<boolean>(
    "ai-lecture-assistant-group-slides",
    false
  );
  const [hoverPreviewIndex, setHoverPreviewIndex] = useState<number | null>(
    null
  );
  const [isRectangleToolActive, setIsRectangleToolActive] = useState(false);

  const { showToast } = useToast();
  const {
    attachments,
    addFile,
    addSelection,
    removeAttachment,
    clearAttachments,
  } = useAttachments();

  const { saveSessionState } = useSessionPersistence({
    session,
    slides,
    transcript,
    currentSlideIndex,
    slideGroups: slideGroups ?? undefined,
  });

  const setCurrentSlideIndex = (updater: React.SetStateAction<number>) => {
    _setCurrentSlideIndex((prevIndex) => {
      const newIndex =
        typeof updater === "function" ? updater(prevIndex) : updater;
      if (prevIndex !== newIndex) {
        logger.debug(
          LOG_SOURCE,
          `Slide index changing from ${prevIndex} to ${newIndex}`
        );
      }
      return newIndex;
    });
  };

  useEffect(() => {
    logger.log(LOG_SOURCE, "Component mounted with session:", {
      sessionId: session.id,
    });
    const checkDesktop = () => {
      if (window.innerWidth >= 768) {
        setIsSlidesVisible(true);
      } else {
        setIsSlidesVisible(false);
      }
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, [session.id]);

  // Proxy for onRenderCanvas to avoid TDZ/hoisting issues and always call latest handler
  const onRenderCanvasRef = useRef<
    | ((contentBlocks: CanvasBlock[], targetSlideIndex?: number) => void)
    | undefined
  >(undefined);
  const handleRenderCanvasProxy = useCallback(
    (contentBlocks: CanvasBlock[], targetSlideIndex?: number) => {
      if (onRenderCanvasRef.current) {
        onRenderCanvasRef.current(contentBlocks, targetSlideIndex);
      } else {
        logger.warn(
          LOG_SOURCE,
          "onRenderCanvas handler not ready yet; dropping this canvas update."
        );
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const maybeGroupSlides = async () => {
      if (!isGroupingEnabled) {
        setSlideGroups(null);
        return;
      }
      // Already grouped in memory
      if (slideGroups && slideGroups.length > 0) {
        return;
      }
      // Reuse saved groups if available on the session
      if (session.slideGroups && session.slideGroups.length > 0) {
        setSlideGroups(session.slideGroups);
        return;
      }
      try {
        setIsGroupingLoading(true);
        const groups = await groupSlidesByAI({
          slides,
          apiKey,
        });
        if (!cancelled) {
          setSlideGroups(groups);
        }
      } catch (e) {
        logger.warn(
          LOG_SOURCE,
          "Slide grouping failed, falling back to flat list.",
          e as any
        );
        if (!cancelled) {
          setSlideGroups(null);
        }
      } finally {
        if (!cancelled) setIsGroupingLoading(false);
      }
    };
    maybeGroupSlides();
    return () => {
      cancelled = true;
    };
  }, [
    isGroupingEnabled,
    slides,
    apiKey,
    session.lectureConfig.model,
    session.slideGroups,
    slideGroups,
  ]);

  const handleTranscriptToggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsTranscriptVisible((prev) => {
        if (!prev) setIsSlidesVisible(false);
        return !prev;
      });
    } else {
      setIsTranscriptVisible((prev) => !prev);
    }
  }, []);

  const handleSlidesToggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsSlidesVisible((prev) => {
        if (!prev) setIsTranscriptVisible(false);
        return !prev;
      });
    } else {
      setIsSlidesVisible((prev) => !prev);
    }
  }, []);

  const handleSlideChangeFromAI = useCallback(
    (slideNumber: number) => {
      logger.log(LOG_SOURCE, `AI requested slide change to ${slideNumber}`);
      const newIndex = slideNumber - 1;
      if (newIndex >= 0 && newIndex < slides.length) {
        setCurrentSlideIndex(newIndex);
      } else {
        logger.warn(
          LOG_SOURCE,
          `AI tried to switch to an invalid slide number: ${slideNumber}`
        );
      }
    },
    [slides.length]
  );

  // handleRenderCanvas is defined after useGeminiLive, see below.

  const {
    sessionState,
    startLecture,
    replay,
    next,
    previous,
    end,
    error,
    goToSlide,
    sendMessage,
    requestExplanation,
  } = useGeminiLive({
    slides: slides,
    generalInfo: session.generalInfo,
    transcript,
    setTranscript,
    isMuted,
    selectedLanguage: session.lectureConfig.language,
    selectedVoice: session.lectureConfig.voice,
    selectedModel: session.lectureConfig.model,
    userCustomPrompt: session.lectureConfig.prompt,
    onSlideChange: handleSlideChangeFromAI,
    onRenderCanvas: handleRenderCanvasProxy,
    apiKey,
    currentSlideIndex,
  });

  const handleRenderCanvas = useCallback(
    (contentBlocks: CanvasBlock[], targetSlideIndex?: number) => {
      const indexToUpdate =
        typeof targetSlideIndex === "number"
          ? targetSlideIndex
          : currentSlideIndex;
      logger.log(
        LOG_SOURCE,
        `Received request to render canvas content for slide index ${indexToUpdate}.`
      );
      setSlides((prevSlides) => {
        const newSlides = [...prevSlides];
        const slideToUpdate = newSlides[indexToUpdate];
        if (slideToUpdate) {
          newSlides[indexToUpdate] = {
            ...slideToUpdate,
            canvasContent: contentBlocks,
          };
        }
        return newSlides;
      });
      setActiveTab("canvas");
      // Markdown-only: no additional validation or fixing here.
    },
    [currentSlideIndex]
  );
  // If the connection dropped and the user unmutes, auto-reconnect
  useEffect(() => {
    if (!isMuted && sessionState === LectureSessionState.DISCONNECTED) {
      logger.log(
        LOG_SOURCE,
        "Microphone unmuted while disconnected. Auto-reconnecting."
      );
      // This is a disconnected reconnection - silent resume
      startLecture("disconnected");
    }
  }, [isMuted, sessionState, startLecture]);
  // Removed: auto-fix error flow. Canvas is markdown-only now.

  // Keep proxy pointing to latest handler
  useEffect(() => {
    onRenderCanvasRef.current = handleRenderCanvas;
  }, [handleRenderCanvas]);

  useEffect(() => {
    if (error) {
      logger.error(
        LOG_SOURCE,
        "Received error from useGeminiLive hook:",
        error
      );
      showToast(error, "error");
    }
  }, [error, showToast]);

  // Reset to slide view whenever the slide changes
  useEffect(() => {
    logger.debug(
      LOG_SOURCE,
      `Slide index changed to ${currentSlideIndex}, resetting tab to 'slide'.`
    );
    setActiveTab("slide");
  }, [currentSlideIndex]);

  const handleStartLecture = () => {
    logger.log(LOG_SOURCE, "handleStartLecture called for a new session.");
    setHasLectureStarted(true);
    // This is a new lecture
    startLecture("new");
  };

  // Auto-mute 1.5s after AI starts speaking unless the turn switches back to the user
  useEffect(() => {
    const prevLen = lastTranscriptLengthRef.current;
    const currLen = transcript.length;
    if (currLen > prevLen) {
      const last = transcript[currLen - 1];
      // New AI output started: schedule auto-mute
      if (last?.speaker === "ai") {
        if (autoMuteTimerRef.current) {
          window.clearTimeout(autoMuteTimerRef.current);
        }
        autoMuteTimerRef.current = window.setTimeout(() => {
          // If user has not started speaking during the delay, enforce mute
          const latest = transcript[transcript.length - 1];
          const userIsSpeaking = latest?.speaker === "user";
          if (!userIsSpeaking) {
            setIsMuted(true);
          }
          autoMuteTimerRef.current = null;
        }, 1500);
      }
    }
    lastTranscriptLengthRef.current = currLen;
    return () => {
      // no-op cleanup; timer is cleared elsewhere when needed
    };
  }, [transcript]);

  // If user starts speaking while a mute timer is pending, cancel it
  useEffect(() => {
    if (!autoMuteTimerRef.current) return;
    const last = transcript[transcript.length - 1];
    if (last?.speaker === "user") {
      window.clearTimeout(autoMuteTimerRef.current);
      autoMuteTimerRef.current = null;
    }
  }, [transcript]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoMuteTimerRef.current) {
        window.clearTimeout(autoMuteTimerRef.current);
        autoMuteTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (session.transcript.length > 0) {
      logger.log(
        LOG_SOURCE,
        "Continuing session, calling startLecture automatically."
      );
      // This is a saved session continuation from SessionsPage
      startLecture("saved");
    }
    // This effect should only run once on mount for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReconnect = useCallback(() => {
    logger.log(LOG_SOURCE, "handleReconnect called.");
    // This is a disconnected reconnection - silent resume
    startLecture("disconnected");
  }, [startLecture]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleToolActivate = useCallback(() => {
    // Open chat panel if it's closed when any tool is activated
    if (!isTranscriptVisible) {
      setIsTranscriptVisible(true);
    }
  }, [isTranscriptVisible]);

  const handleRectangleToolToggle = useCallback(() => {
    setIsRectangleToolActive((prev) => !prev);
  }, []);

  const handleRectangleToolDeactivate = useCallback(() => {
    setIsRectangleToolActive(false);
  }, []);

  const handleSelectionAdd = useCallback(
    (imageDataUrl: string) => {
      addSelection(imageDataUrl);
    },
    [addSelection]
  );

  const handleNext = useCallback(() => {
    logger.debug(LOG_SOURCE, "handleNext called.");
    if (currentSlideIndex < slides.length - 1) {
      next();
    }
  }, [currentSlideIndex, slides.length, next]);

  const handlePrevious = useCallback(() => {
    logger.debug(LOG_SOURCE, "handlePrevious called.");
    if (currentSlideIndex > 0) {
      previous();
    }
  }, [currentSlideIndex, previous]);

  const SLIDE_CHANGE_DEBOUNCE_MS = 200;
  const slideChangeTimerRef = useRef<number | undefined>();
  const handleSelectSlide = useCallback(
    (index: number) => {
      logger.debug(LOG_SOURCE, `handleSelectSlide called for index ${index}.`);
      if (slideChangeTimerRef.current) {
        window.clearTimeout(slideChangeTimerRef.current);
      }
      slideChangeTimerRef.current = window.setTimeout(() => {
        const slide = slides[index];
        if (!slide) return;
        // Clear any hover preview when a slide is clicked
        setHoverPreviewIndex(null);
        if (index !== currentSlideIndex) {
          setCurrentSlideIndex(index);
          if (requestExplanation) {
            requestExplanation(slide);
          }
        }
      }, SLIDE_CHANGE_DEBOUNCE_MS);
    },
    [currentSlideIndex, slides, requestExplanation, setHoverPreviewIndex]
  );

  const handleSendMessage = useCallback(
    (message: string, messageAttachments?: ChatAttachment[]) => {
      logger.debug(LOG_SOURCE, "handleSendMessage called for typed text.");
      if (!sendMessage) return;

      // Skip empty messages (no text and no attachments)
      const trimmedMessage = message.trim();
      if (
        !trimmedMessage &&
        (!messageAttachments || messageAttachments.length === 0)
      ) {
        return;
      }

      // Optimistically add the user's typed message to the transcript.
      // The `inputTranscription` event is for voice input, not for messages sent via this text input.
      // Tag user messages with the current slide number
      setTranscript((prev) => [
        ...prev,
        {
          speaker: "user",
          text: message,
          attachments: messageAttachments,
          slideNumber: currentSlideIndex + 1,
        },
      ]);
      sendMessage({
        text: message,
        attachments: messageAttachments,
        turnComplete: true,
      });
      clearAttachments();
    },
    [sendMessage, setTranscript, clearAttachments, currentSlideIndex]
  );

  const handleEndSession = useCallback(async () => {
    logger.log(LOG_SOURCE, "handleEndSession called. Forcing final save.");
    await saveSessionState();
    end();
    onEndSession();
  }, [saveSessionState, end, onEndSession]);

  const handleDownloadTranscript = useCallback(() => {
    if (transcript.length === 0 && !session.generalInfo) return;

    const header = `AI Lecture Transcript\n=====================\n\n`;
    const overview = `Presentation Overview:\n${session.generalInfo}\n\n---------------------\nConversation History:\n---------------------\n\n`;

    const conversation = transcript
      .map(
        (entry) =>
          `${entry.speaker === "user" ? "User" : "AI Lecturer"}: ${entry.text}`
      )
      .join("\n\n");

    const fileContent = header + overview + conversation;

    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const baseFileName = session.fileName.replace(/\.pdf$/i, "");
    link.download = `${baseFileName}-transcript.txt`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logger.log(LOG_SOURCE, "Transcript downloaded.");
  }, [transcript, session.generalInfo, session.fileName]);

  const tabButtonClasses = (tabName: "slide" | "canvas") =>
    `px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none ${
      activeTab === tabName
        ? "text-blue-400 border-b-2 border-blue-400"
        : "text-gray-400 border-b-2 border-transparent hover:bg-gray-700/50 hover:text-gray-200"
    }`;

  const currentCanvasContent = slides[currentSlideIndex]?.canvasContent || [];

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Desktop Left Transcript Panel */}
      <div className="hidden md:flex">
        <TranscriptPanel
          isVisible={isTranscriptVisible}
          onClose={handleTranscriptToggle}
          transcript={transcript}
          isDesktop={true}
          onSendMessage={handleSendMessage}
          sessionState={sessionState}
          attachments={attachments}
          onAddFile={addFile}
          onAddSelection={addSelection}
          onRemoveAttachment={removeAttachment}
          onClearAttachments={clearAttachments}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          fileName={session.fileName}
          currentSlide={currentSlideIndex + 1}
          totalSlides={slides.length}
        />

        <div className="flex-1 flex flex-col relative overflow-hidden">
          <main className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Tab buttons and Toolbox */}
              <div className="relative flex items-center justify-between border-b border-gray-700 z-10">
                <TabNav activeTab={activeTab} onChange={setActiveTab} />
                <Toolbox
                  isRectangleToolActive={isRectangleToolActive}
                  onRectangleToolToggle={handleRectangleToolToggle}
                  onToolActivate={handleToolActivate}
                />
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 pt-4">
                <div
                  className={`${
                    activeTab === "slide" ? "block" : "hidden"
                  } w-full h-full relative`}
                >
                  <SlideViewer
                    slide={slides[currentSlideIndex]}
                    sessionState={sessionState}
                    error={error}
                    onReconnect={handleReconnect}
                    isRectangleToolActive={isRectangleToolActive}
                    onSelectionAdd={handleSelectionAdd}
                    onRectangleToolDeactivate={handleRectangleToolDeactivate}
                  />
                  {hoverPreviewIndex != null &&
                    hoverPreviewIndex !== currentSlideIndex &&
                    slides[hoverPreviewIndex] && (
                      <div className="hidden md:flex pointer-events-none absolute inset-0 z-20 items-center justify-center">
                        <img
                          src={slides[hoverPreviewIndex].imageDataUrl}
                          alt={`Slide ${slides[hoverPreviewIndex].pageNumber} preview`}
                          className="max-w-[85%] max-h-[85%] object-contain rounded-lg ring-2 ring-white/30 shadow-2xl"
                        />
                      </div>
                    )}
                </div>
                <div
                  className={`${
                    activeTab === "canvas" ? "block" : "hidden"
                  } w-full h-full`}
                >
                  <CanvasViewer
                    content={currentCanvasContent}
                    isRectangleToolActive={isRectangleToolActive}
                    onSelectionAdd={handleSelectionAdd}
                    onRectangleToolDeactivate={handleRectangleToolDeactivate}
                  />
                </div>
              </div>
            </div>

            {/* Mobile Transcript Panel */}
            <div className="md:hidden">
              <TranscriptPanel
                isVisible={isTranscriptVisible}
                onClose={handleTranscriptToggle}
                transcript={transcript}
                isDesktop={false}
                onSendMessage={handleSendMessage}
                sessionState={sessionState}
                attachments={attachments}
                onAddFile={addFile}
                onAddSelection={addSelection}
                onRemoveAttachment={removeAttachment}
                onClearAttachments={clearAttachments}
              />
            </div>

            {/* Mobile Slides Overview Panel */}
            <div
              className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
                isSlidesVisible ? "h-36 mt-4" : "h-0"
              }`}
            >
              <div className="h-full bg-gray-800/50 rounded-lg border border-gray-700 p-2 overflow-x-auto flex items-center space-x-2">
                {isGroupingEnabled && slideGroups ? (
                  <div className="w-full">
                    <GroupedSlidesThumbStrip
                      slides={slides}
                      groups={slideGroups}
                      currentIndex={currentSlideIndex}
                      onSelect={handleSelectSlide}
                    />
                  </div>
                ) : (
                  <SlidesThumbStrip
                    slides={slides}
                    currentIndex={currentSlideIndex}
                    onSelect={handleSelectSlide}
                    itemClassName="flex-shrink-0 h-full aspect-[4/3]"
                    imageClassName="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </main>

          {!hasLectureStarted && (
            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-30">
              <button
                onClick={handleStartLecture}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105 shadow-lg flex items-center gap-3"
                aria-label="Start Lecture"
              >
                <PlayCircle className="h-8 w-8" />
                Start Lecture
              </button>
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-t border-gray-700 p-4 z-20">
          {hasLectureStarted ? (
            <Controls
              isMuted={isMuted}
              onMuteToggle={handleMuteToggle}
              onReplay={replay}
              onNext={handleNext}
              onPrevious={handlePrevious}
              isNextDisabled={currentSlideIndex >= slides.length - 1}
              isPreviousDisabled={currentSlideIndex <= 0}
              onTranscriptToggle={handleTranscriptToggle}
              onSlidesToggle={handleSlidesToggle}
              onDownloadTranscript={handleDownloadTranscript}
              isTranscriptEmpty={transcript.length === 0}
              onEndSession={handleEndSession}
            />
          ) : (
            <div className="flex items-center justify-end h-16">
              <button
                onClick={handleEndSession}
                title="End Session"
                className="flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 bg-red-800/80 text-red-300 hover:bg-red-700"
              >
                <Power className="h-6 w-6" />
              </button>
            </div>
          )}
        </footer>
      </div>

      {/* Desktop Right Slides Panel */}
      <aside
        className={`hidden md:flex flex-col bg-gray-800/50 border-l border-gray-700 transition-all duration-300 ease-in-out ${
          isSlidesVisible ? "w-48 md:w-64 p-2" : "w-0"
        }`}
        onMouseLeave={() => setHoverPreviewIndex(null)}
      >
        {isSlidesVisible && (
          <>
            <h2 className="text-sm font-semibold text-gray-400 p-2 flex-shrink-0">
              {isGroupingEnabled ? "Slides (Grouped)" : "Slides"}
            </h2>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {isGroupingLoading ? (
                <div className="text-xs text-gray-400 p-2">
                  Grouping slides…
                </div>
              ) : isGroupingEnabled && slideGroups ? (
                <GroupedSlidesThumbStrip
                  slides={slides}
                  groups={slideGroups}
                  currentIndex={currentSlideIndex}
                  onSelect={handleSelectSlide}
                  onHover={setHoverPreviewIndex}
                />
              ) : (
                <SlidesThumbStrip
                  slides={slides}
                  currentIndex={currentSlideIndex}
                  onSelect={handleSelectSlide}
                  onHover={setHoverPreviewIndex}
                />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

export default LecturePage;
