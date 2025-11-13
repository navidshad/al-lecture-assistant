import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";
// FIX: Removed `LiveSession` as it is not an exported member of '@google/genai'.
import { GoogleGenAI, LiveServerMessage } from "@google/genai";
import {
  Slide,
  LectureSessionState,
  TranscriptEntry,
  CanvasBlock,
} from "../types";
import { logger } from "../services/logger";
import {
  normalizeCanvasBlocks,
  REANCHOR_EVERY_N_TURNS,
} from "../services/geminiLiveUtils";
import { buildSessionConfig } from "../services/geminiLiveConfig";
import { useTranscriptManager } from "./useTranscriptManager";
import {
  buildSlideMemory,
  buildSlideAnchorText,
} from "../services/slideMemory";
import { createSendMessage } from "../services/geminiLiveMessaging";
import { useSessionState } from "./useSessionState";
import {
  initializeInputAudio,
  initializeOutputAudio,
  cleanupAudioResources,
  flushAudioOutput,
  handleAudioPlayback,
  AudioRefs,
} from "../services/geminiLiveAudio";
import {
  storeResumptionHandle,
  getResumptionHandle,
  clearResumptionHandle,
} from "../services/sessionResumption";

const LOG_SOURCE = "useGeminiLive";

interface UseGeminiLiveProps {
  slides: Slide[];
  generalInfo: string;
  transcript: TranscriptEntry[];
  setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>;
  isMuted: boolean;
  selectedLanguage: string;
  selectedVoice: string;
  selectedModel: string;
  userCustomPrompt?: string;
  onSlideChange: (slideNumber: number) => void;
  onRenderCanvas: (
    contentBlocks: CanvasBlock[],
    targetSlideIndex?: number
  ) => void;
  apiKey: string | null;
  currentSlideIndex: number;
}

export const useGeminiLive = ({
  slides,
  generalInfo,
  transcript,
  setTranscript,
  isMuted,
  selectedLanguage,
  selectedVoice,
  selectedModel,
  userCustomPrompt,
  onSlideChange,
  onRenderCanvas,
  apiKey,
  currentSlideIndex,
}: UseGeminiLiveProps) => {
  // Use extracted session state manager
  const { sessionState, setSessionState, error, setError } = useSessionState();

  // FIX: Replaced `Promise<LiveSession>` with `Promise<any>` as `LiveSession` is not exported.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // Incrementing sequence number to identify the latest live connection.
  // Used to ignore late events from previous connections (e.g., onclose) to avoid false DISCONNECTED states.
  const connectSeqRef = useRef(0);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const isMutedRef = useRef(isMuted);
  const aiMessageOpenRef = useRef(false);
  const currentSlideIndexRef = useRef(currentSlideIndex);
  // Track if the underlying websocket/session is open to prevent sending on a closed socket
  const sessionOpenRef = useRef(false);
  // Sequence guard for slide-change related async sends
  const slideChangeSeqRef = useRef(0);
  // Counter for periodic re-anchoring during long conversations
  const turnCounterRef = useRef(0);
  // Session resumption tracking
  const userEndedSessionRef = useRef(false);
  const reconnectionAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const MAX_RECONNECTION_ATTEMPTS = 3;
  // Helper: safely run logic with a live session without throwing on closed socket
  const runWithOpenSession = useCallback((runner: (session: any) => void) => {
    if (!sessionOpenRef.current || !sessionPromiseRef.current) {
      return;
    }
    sessionPromiseRef.current
      .then((session) => {
        if (!sessionOpenRef.current) return;
        try {
          runner(session);
        } catch (e) {
          logger.warn(
            LOG_SOURCE,
            "Attempted to use session but underlying socket failed.",
            e as any
          );
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
  }, [currentSlideIndex]);

  // Create audio refs object for audio management service
  const audioRefs: AudioRefs = {
    mediaStreamRef,
    audioContextRef,
    scriptProcessorRef,
    mediaStreamSourceRef,
    outputAudioContextRef,
    nextStartTimeRef,
    audioSourcesRef,
    isMutedRef,
    sessionOpenRef,
    sessionPromiseRef,
    aiMessageOpenRef,
  };

  const cleanupConnectionResources = useCallback(() => {
    cleanupAudioResources(audioRefs);
  }, []);

  // FIX: Renamed disconnect to end to match what's being returned and used in LecturePage.
  const end = useCallback(() => {
    logger.log(LOG_SOURCE, "end() called. Performing full cleanup.");
    // Mark session as explicitly ended by user
    userEndedSessionRef.current = true;
    sessionOpenRef.current = false;
    // Clear resumption handle since user explicitly ended
    clearResumptionHandle();
    // Reset reconnection attempts
    reconnectionAttemptsRef.current = 0;
    isReconnectingRef.current = false;
    cleanupConnectionResources();
    setSessionState(LectureSessionState.ENDED);
  }, [cleanupConnectionResources]);

  const flushOutput = useCallback(() => {
    flushAudioOutput(audioRefs, runWithOpenSession);
  }, [runWithOpenSession]);

  // Use extracted transcript manager
  const { addTranscriptEntry } = useTranscriptManager({
    setTranscript,
    currentSlideIndexRef,
    aiMessageOpenRef,
  });

  // Create sendMessage function using extracted messaging service
  const sendMessage = useCallback(
    createSendMessage({
      sessionOpenRef,
      runWithOpenSession,
    }),
    [runWithOpenSession]
  );

  // (removed) sendSlideImageContext – unified into sendMessage

  const sendStrongSlideAnchor = useCallback(
    (slide: Slide, transcriptNow: TranscriptEntry[]) => {
      const slideNo = slide.pageNumber;
      const keyTurns = buildSlideMemory(
        transcriptNow,
        slideNo,
        currentSlideIndexRef.current,
        8,
        1800
      );
      const anchor = [
        `ACTIVE SLIDE: ${slideNo}`,
        slide.summary ? `SUMMARY: ${slide.summary}` : null,
        slide.textContent
          ? `TEXT EXCERPT: ${slide.textContent.slice(0, 1000)}`
          : null,
        keyTurns ? `KEY POINTS SO FAR:\n${keyTurns}` : null,
        `FOCUS: Explain ONLY slide ${slideNo}.`,
      ]
        .filter(Boolean)
        .join("\n");
      sendMessage({ text: anchor, turnComplete: false });
    },
    [sendMessage]
  );

  const buildSlideAnchorTextLocal = useCallback(
    (slide: Slide, transcriptNow: TranscriptEntry[]) => {
      return buildSlideAnchorText(
        slide,
        transcriptNow,
        currentSlideIndexRef.current
      );
    },
    []
  );

  // Sends image + optional canvas context + text instruction as ONE coherent turn.
  // (removed) sendCombinedImageAndTextTurn – unified into sendMessage

  const requestExplanation = useCallback(
    (slide: Slide) => {
      logger.debug(
        LOG_SOURCE,
        `requestExplanation called for slide ${slide.pageNumber}`
      );
      // Stop any ongoing output before changing context
      flushOutput();
      const anchor = buildSlideAnchorTextLocal(slide, transcript);
      sendMessage({ slide, text: anchor, turnComplete: true });
    },
    [flushOutput, buildSlideAnchorTextLocal, sendMessage, transcript]
  );

  // Store startLecture in a ref to avoid stale closures in setTimeout callbacks
  const startLectureRef = useRef<
    ((reconnectionType?: "disconnected" | "saved" | "new") => void) | null
  >(null);

  const startLecture = useCallback(
    (reconnectionType?: "disconnected" | "saved" | "new") => {
      logger.log(
        LOG_SOURCE,
        `startLecture() called with reconnectionType: ${
          reconnectionType || "new"
        }.`
      );
      if (slides.length === 0) {
        logger.warn(
          LOG_SOURCE,
          "startLecture() called with 0 slides. Aborting."
        );
        return;
      }

      cleanupConnectionResources();
      setSessionState(LectureSessionState.CONNECTING);
      setError(null);

      // Reset user-ended flag for new sessions (allows automatic reconnection for disconnected sessions)
      // Don't reset if user explicitly ended - that flag persists
      if (reconnectionType === "new") {
        userEndedSessionRef.current = false;
      }

      // Bump sequence to tag this connection as the latest one
      const thisConnectSeq = ++connectSeqRef.current;

      const ai = new GoogleGenAI({ apiKey: apiKey ?? process.env.API_KEY! });
      // Initialize output audio context
      initializeOutputAudio(outputAudioContextRef);

      // Determine reconnection type: if not provided, infer from transcript
      const isReconnect = transcript.length > 0;
      const reconnectType = reconnectionType || (isReconnect ? "saved" : "new");

      // Retrieve resumption handle if available (for automatic reconnection)
      const resumptionHandle = getResumptionHandle();

      // Build session config using extracted builder
      const sessionConfig = buildSessionConfig({
        model: selectedModel,
        selectedVoice,
        selectedLanguage,
        generalInfo,
        userCustomPrompt,
        resumptionHandle: resumptionHandle,
      });

      // Reset user-ended flag when starting a new connection
      // (unless this is an explicit user end, which is handled in end())
      if (!userEndedSessionRef.current) {
        isReconnectingRef.current = reconnectType === "disconnected";
      }

      logger.debug(LOG_SOURCE, "Connecting to Gemini Live...");

      const sessionPromise = ai.live.connect({
        ...sessionConfig,
        callbacks: {
          onopen: async () => {
            // Ignore if this open belongs to an older connection
            if (thisConnectSeq !== connectSeqRef.current) {
              return;
            }
            logger.log(LOG_SOURCE, "Session opened successfully.");
            sessionOpenRef.current = true;
            // Reset reconnection attempts on successful connection
            reconnectionAttemptsRef.current = 0;
            isReconnectingRef.current = false;
            try {
              // Initialize input audio (microphone stream and processing)
              await initializeInputAudio(audioRefs, runWithOpenSession);

              setSessionState(LectureSessionState.READY);

              const lecturePlanForAI = slides
                .map((s) => `Slide ${s.pageNumber}: ${s.summary}`)
                .join("\n");

              if (isReconnect) {
                const currentSlideNumber = currentSlideIndex + 1;
                const currentSlide = slides[currentSlideIndex];

                if (reconnectType === "disconnected") {
                  // Silent reconnect: send slide image + canvas + recent messages from active slide only
                  logger.log(
                    LOG_SOURCE,
                    "Reconnecting from disconnected state. Silent resume with context."
                  );
                  const recentMessages = buildSlideMemory(
                    transcript,
                    currentSlideNumber,
                    currentSlideIndexRef.current,
                    8,
                    1800
                  );
                  const contextParts: string[] = [
                    `ACTIVE SLIDE: ${currentSlideNumber}`,
                    currentSlide.summary
                      ? `SUMMARY: ${currentSlide.summary}`
                      : null,
                    currentSlide.textContent
                      ? `TEXT EXCERPT: ${currentSlide.textContent.slice(
                          0,
                          1000
                        )}`
                      : null,
                    recentMessages
                      ? `RECENT CONTEXT FROM THIS SLIDE:\n${recentMessages}`
                      : null,
                  ].filter(Boolean) as string[];

                  // Send slide image + canvas + context without any greeting instruction
                  sendMessage({
                    slide: currentSlide,
                    text: contextParts.join("\n"),
                    turnComplete: true,
                  });
                } else {
                  // Saved session continuation: keep current behavior with greeting
                  logger.log(
                    LOG_SOURCE,
                    "Reconnecting saved session. Greeting-only resume."
                  );
                  const instruction = `INSTRUCTION: You are resuming an existing lecture. ONLY say: "We are on slide ${currentSlideNumber}, ready to continue!" Do not explain any content. Wait for the user to proceed.`;
                  // Single-turn send: image + canvas (if any) + instruction
                  sendMessage({
                    slide: currentSlide,
                    text: instruction,
                    turnComplete: true,
                  });
                }
              } else {
                // For a new lecture, send the initial image + plan + instruction as a single turn
                const firstSlide = slides[0];
                const base64Data = firstSlide.imageDataUrl.split(",")[1];
                if (base64Data) {
                  const parts: any[] = [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: base64Data,
                      },
                    },
                    {
                      text: `CONTEXT: The lecture plan is as follows:\n${lecturePlanForAI}\n\nEND OF CONTEXT.`,
                    },
                    {
                      text: `INSTRUCTION: You are on slide 1. Please begin the lecture now. Greet the user and then explain the content of this first slide.`,
                    },
                  ];
                  runWithOpenSession((session) => {
                    try {
                      session.sendClientContent?.({
                        turns: [{ role: "user", parts }],
                        turnComplete: true,
                      });
                      logger.debug(
                        LOG_SOURCE,
                        "Sent initial context and instruction as a single turn for a new lecture."
                      );
                    } catch (e) {
                      logger.warn(
                        LOG_SOURCE,
                        "sendClientContent failed for initial lecture; falling back to separate realtime inputs.",
                        e as any
                      );
                      try {
                        session.sendRealtimeInput({
                          media: { data: base64Data, mimeType: "image/png" },
                        });
                        session.sendRealtimeInput({
                          text: `CONTEXT: The lecture plan is as follows:\n${lecturePlanForAI}\n\nEND OF CONTEXT.`,
                        });
                        session.sendRealtimeInput({
                          text: `INSTRUCTION: You are on slide 1. Please begin the lecture now. Greet the user and then explain the content of this first slide.`,
                        });
                        session.sendRealtimeInput?.({ event: "end_of_turn" });
                      } catch {}
                    }
                  });
                } else {
                  // Fallback if image is missing (should not happen)
                  sendMessage({
                    text: [
                      `CONTEXT: The lecture plan is as follows:\n${lecturePlanForAI}\n\nEND OF CONTEXT.`,
                      `INSTRUCTION: You are on slide 1. Please begin the lecture now. Greet the user and then explain the content of this first slide.`,
                    ],
                    turnComplete: true,
                  });
                  runWithOpenSession((session) => {
                    try {
                      session.sendRealtimeInput?.({ event: "end_of_turn" });
                    } catch {}
                  });
                }
              }
            } catch (err) {
              logger.error(
                LOG_SOURCE,
                "Microphone access denied or error:",
                err
              );
              setError(
                "Microphone access is required. Please allow microphone permissions and refresh."
              );
              sessionOpenRef.current = false;
              // Cleanup but keep the session in an error state rather than "ENDED"
              cleanupConnectionResources();
              setSessionState(LectureSessionState.ERROR);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Ignore messages from older connections
            if (thisConnectSeq !== connectSeqRef.current) {
              return;
            }

            // Handle session resumption updates
            if ((message as any).sessionResumptionUpdate) {
              const update = (message as any).sessionResumptionUpdate;
              if (update.resumable && update.newHandle) {
                storeResumptionHandle(update.newHandle);
                logger.log(
                  LOG_SOURCE,
                  "Received new resumption handle, stored for future reconnection"
                );
                // Reset reconnection attempts on successful resumption update
                reconnectionAttemptsRef.current = 0;
                isReconnectingRef.current = false;
              }
            }

            // Handle GoAway messages (connection will terminate soon)
            if ((message as any).goAway) {
              const goAway = (message as any).goAway;
              const timeLeft = goAway.timeLeft;
              logger.warn(
                LOG_SOURCE,
                `Connection will terminate in ${timeLeft} seconds`
              );

              // Proactive reconnection: start reconnecting before connection terminates
              if (!userEndedSessionRef.current && !isReconnectingRef.current) {
                logger.log(
                  LOG_SOURCE,
                  "Starting proactive reconnection before connection terminates"
                );
                isReconnectingRef.current = true;
                setError("Reconnecting to maintain session...");
                // Small delay to let current message processing complete
                setTimeout(() => {
                  if (!userEndedSessionRef.current && startLectureRef.current) {
                    startLectureRef.current("disconnected");
                  }
                }, 1000);
              }
            }

            if (message.serverContent) {
              setSessionState(LectureSessionState.LECTURING);
            }
            if (message.serverContent?.inputTranscription) {
              setSessionState(LectureSessionState.LISTENING);
            }

            if (message.toolCall) {
              logger.debug(LOG_SOURCE, "Received tool call:", message.toolCall);
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === "setActiveSlide") {
                  const slideNumber = fc.args.slideNumber as number;
                  logger.log(
                    LOG_SOURCE,
                    `Processing setActiveSlide function call for slide number: ${slideNumber}`
                  );
                  if (slideNumber >= 1 && slideNumber <= slides.length) {
                    // Update the slide index ref immediately to ensure transcript tagging uses the latest slide
                    currentSlideIndexRef.current = slideNumber - 1;
                    // Interrupt any ongoing output before changing context
                    flushOutput();
                    onSlideChange(slideNumber);
                    // Send slide image/canvas and anchor in a single coherent turn
                    const slide = slides[slideNumber - 1];
                    const anchor = buildSlideAnchorTextLocal(slide, transcript);
                    sendMessage({ slide, text: anchor, turnComplete: true });
                    runWithOpenSession((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            result: `OK. Changed to slide ${slideNumber}.`,
                          },
                        },
                      });
                    });
                  } else {
                    logger.error(
                      LOG_SOURCE,
                      `AI requested invalid slide number: ${slideNumber}`
                    );
                    runWithOpenSession((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error: `Invalid slide number: ${slideNumber}. There are only ${slides.length} slides.`,
                          },
                        },
                      });
                    });
                  }
                } else if (fc.name === "provideCanvasMarkdown") {
                  logger.log(
                    LOG_SOURCE,
                    "provideCanvasMarkdown raw args:",
                    fc.args,
                    "(type:",
                    typeof fc.args,
                    ")"
                  );
                  let parsedArgs = fc.args;
                  if (typeof parsedArgs === "string") {
                    try {
                      parsedArgs = JSON.parse(parsedArgs);
                    } catch {
                      logger.warn(
                        LOG_SOURCE,
                        "Failed to parse JSON args for provideCanvasMarkdown; treating as markdown string"
                      );
                      // Treat the string itself as markdown
                      const contentBlocks = normalizeCanvasBlocks([
                        { type: "markdown", content: parsedArgs },
                      ]);
                      onRenderCanvas(
                        contentBlocks,
                        currentSlideIndexRef.current
                      );
                      runWithOpenSession((session) => {
                        session.sendToolResponse({
                          functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: {
                              result: `OK. Canvas content has been rendered from string.`,
                            },
                          },
                        });
                      });
                      continue;
                    }
                  }

                  logger.log(
                    LOG_SOURCE,
                    "provideCanvasMarkdown parsed args:",
                    parsedArgs
                  );
                  const markdown =
                    (parsedArgs as any)?.markdown ??
                    (typeof parsedArgs === "string" ? parsedArgs : null);

                  if (markdown && typeof markdown === "string") {
                    logger.log(
                      LOG_SOURCE,
                      `Processing provideCanvasMarkdown function call with markdown length: ${markdown.length}`
                    );
                    // Convert markdown string to CanvasBlock array
                    const contentBlocks = normalizeCanvasBlocks([
                      { type: "markdown", content: markdown },
                    ]);
                    onRenderCanvas(contentBlocks, currentSlideIndexRef.current);
                    runWithOpenSession((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            result: `OK. Canvas content has been rendered.`,
                          },
                        },
                      });
                    });
                  } else {
                    logger.warn(
                      LOG_SOURCE,
                      `provideCanvasMarkdown received invalid args; no markdown field found`,
                      parsedArgs
                    );
                    onRenderCanvas([
                      {
                        type: "markdown",
                        content: JSON.stringify(parsedArgs, null, 2),
                      },
                    ]);
                    runWithOpenSession((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            result: `Rendered fallback block from invalid args.`,
                          },
                        },
                      });
                    });
                  }
                }
              }
            }

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              addTranscriptEntry(text, "user", {
                updateLastEntry: true,
              });
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              addTranscriptEntry(text, "ai", {
                updateLastEntry: aiMessageOpenRef.current,
              });
            }

            // Handle audio playback from server
            const audioData =
              message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              await handleAudioPlayback(audioData, audioRefs);
            }

            if (message.serverContent?.generationComplete) {
              // Primary delimiter: model finished generating this response
              aiMessageOpenRef.current = false;
              // Periodically re-anchor to the active slide during long conversations
              if (REANCHOR_EVERY_N_TURNS > 0) {
                turnCounterRef.current += 1;
                if (turnCounterRef.current % REANCHOR_EVERY_N_TURNS === 0) {
                  const slide = slides[currentSlideIndexRef.current];
                  if (slide) {
                    sendStrongSlideAnchor(slide, transcript);
                  }
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              // Backup delimiter
              aiMessageOpenRef.current = false;
            }

            if (message.serverContent?.interrupted) {
              logger.debug(
                LOG_SOURCE,
                "AI speech was interrupted. Clearing audio queue."
              );
              // Flush audio output on interruption
              flushAudioOutput(audioRefs, runWithOpenSession);
            }
          },
          onerror: (e: ErrorEvent) => {
            // Ignore errors from older connections
            if (thisConnectSeq !== connectSeqRef.current) {
              return;
            }
            logger.error(LOG_SOURCE, "Session error event received.", e);
            sessionOpenRef.current = false;

            // If user explicitly ended session, don't attempt reconnection
            if (userEndedSessionRef.current) {
              cleanupConnectionResources();
              setSessionState(LectureSessionState.ENDED);
              return;
            }

            // Attempt automatic reconnection unless max attempts reached
            if (
              reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS &&
              !isReconnectingRef.current
            ) {
              reconnectionAttemptsRef.current += 1;
              isReconnectingRef.current = true;
              const delay = Math.min(
                1000 * Math.pow(2, reconnectionAttemptsRef.current - 1),
                5000
              ); // Exponential backoff, max 5s
              logger.log(
                LOG_SOURCE,
                `Attempting automatic reconnection (attempt ${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS}) after ${delay}ms`
              );
              setError(
                `Reconnecting... (attempt ${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS})`
              );
              cleanupConnectionResources();
              setTimeout(() => {
                if (!userEndedSessionRef.current && startLectureRef.current) {
                  startLectureRef.current("disconnected");
                }
              }, delay);
            } else {
              // Max attempts reached or already reconnecting
              setError(
                reconnectionAttemptsRef.current >= MAX_RECONNECTION_ATTEMPTS
                  ? "Connection failed after multiple attempts. Please try reconnecting manually."
                  : "A connection error occurred. Please try to reconnect."
              );
              cleanupConnectionResources();
              setSessionState(LectureSessionState.DISCONNECTED);
              isReconnectingRef.current = false;
            }
          },
          onclose: (e: CloseEvent) => {
            // Ignore closes from older connections (e.g., cleanup of previous session)
            if (thisConnectSeq !== connectSeqRef.current) {
              return;
            }
            logger.warn(
              LOG_SOURCE,
              "Session close event received. Code:",
              e.code,
              "Reason:",
              e.reason,
              "wasClean:",
              e.wasClean
            );
            sessionOpenRef.current = false;

            // If user explicitly ended session, don't attempt reconnection
            if (userEndedSessionRef.current) {
              cleanupConnectionResources();
              setSessionState(LectureSessionState.ENDED);
              return;
            }

            // Attempt automatic reconnection unless max attempts reached
            if (
              reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS &&
              !isReconnectingRef.current
            ) {
              reconnectionAttemptsRef.current += 1;
              isReconnectingRef.current = true;
              const delay = Math.min(
                1000 * Math.pow(2, reconnectionAttemptsRef.current - 1),
                5000
              ); // Exponential backoff, max 5s
              logger.log(
                LOG_SOURCE,
                `Connection closed. Attempting automatic reconnection (attempt ${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS}) after ${delay}ms`
              );
              setError(
                `Reconnecting... (attempt ${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS})`
              );
              cleanupConnectionResources();
              setTimeout(() => {
                if (!userEndedSessionRef.current && startLectureRef.current) {
                  startLectureRef.current("disconnected");
                }
              }, delay);
            } else {
              // Max attempts reached or already reconnecting
              setError(
                reconnectionAttemptsRef.current >= MAX_RECONNECTION_ATTEMPTS
                  ? "Connection lost after multiple reconnection attempts. Please try reconnecting manually."
                  : e.wasClean
                  ? "Connection closed."
                  : "The connection was lost unexpectedly. Please reconnect."
              );
              cleanupConnectionResources();
              setSessionState(LectureSessionState.DISCONNECTED);
              isReconnectingRef.current = false;
            }
          },
        },
      });

      sessionPromiseRef.current = sessionPromise;
    },
    [
      slides,
      generalInfo,
      transcript,
      setTranscript,
      sendMessage,
      selectedLanguage,
      selectedVoice,
      selectedModel,
      userCustomPrompt,
      onSlideChange,
      onRenderCanvas,
      apiKey,
      cleanupConnectionResources,
      currentSlideIndex,
      buildSlideMemory,
      addTranscriptEntry,
    ]
  );

  // Update ref with latest startLecture function
  startLectureRef.current = startLecture;

  const replay = useCallback(() => {
    logger.debug(LOG_SOURCE, "replay() called.");
    sendMessage({
      text: "Please repeat your explanation for this slide.",
      turnComplete: true,
    });
  }, [sendMessage]);
  const next = useCallback(() => {
    logger.debug(LOG_SOURCE, "next() called.");
    const nextIndex = currentSlideIndexRef.current + 1;
    if (nextIndex >= slides.length) {
      logger.warn(
        LOG_SOURCE,
        "next() called but already on last slide. Ignoring."
      );
      return;
    }
    const slideNumber = nextIndex + 1;
    // Update the slide index ref immediately
    currentSlideIndexRef.current = nextIndex;
    // Interrupt any ongoing output before changing context
    flushOutput();
    onSlideChange(slideNumber);
    // Send slide image/canvas and anchor in a single coherent turn
    const slide = slides[nextIndex];
    const anchor = buildSlideAnchorTextLocal(slide, transcript);
    sendMessage({ slide, text: anchor, turnComplete: true });
  }, [
    sendMessage,
    flushOutput,
    buildSlideAnchorTextLocal,
    slides,
    transcript,
    onSlideChange,
  ]);
  const previous = useCallback(() => {
    logger.debug(LOG_SOURCE, "previous() called.");
    const prevIndex = currentSlideIndexRef.current - 1;
    if (prevIndex < 0) {
      logger.warn(
        LOG_SOURCE,
        "previous() called but already on first slide. Ignoring."
      );
      return;
    }
    const slideNumber = prevIndex + 1;
    // Update the slide index ref immediately
    currentSlideIndexRef.current = prevIndex;
    // Interrupt any ongoing output before changing context
    flushOutput();
    onSlideChange(slideNumber);
    // Send slide image/canvas and anchor in a single coherent turn
    const slide = slides[prevIndex];
    const anchor = buildSlideAnchorTextLocal(slide, transcript);
    sendMessage({ slide, text: anchor, turnComplete: true });
  }, [
    sendMessage,
    flushOutput,
    buildSlideAnchorTextLocal,
    slides,
    transcript,
    onSlideChange,
  ]);
  const goToSlide = useCallback(
    (slideNumber: number) => {
      logger.debug(LOG_SOURCE, `goToSlide(${slideNumber}) called.`);
      if (slideNumber < 1 || slideNumber > slides.length) {
        logger.warn(
          LOG_SOURCE,
          `goToSlide() called with invalid slide number: ${slideNumber}. Valid range: 1-${slides.length}. Ignoring.`
        );
        return;
      }
      const targetIndex = slideNumber - 1;
      // Update the slide index ref immediately
      currentSlideIndexRef.current = targetIndex;
      // Interrupt any ongoing output before changing context
      flushOutput();
      onSlideChange(slideNumber);
      // Send slide image/canvas and anchor in a single coherent turn
      const slide = slides[targetIndex];
      const anchor = buildSlideAnchorTextLocal(slide, transcript);
      sendMessage({ slide, text: anchor, turnComplete: true });
    },
    [
      sendMessage,
      flushOutput,
      buildSlideAnchorTextLocal,
      slides,
      transcript,
      onSlideChange,
    ]
  );

  useEffect(() => {
    logger.log(LOG_SOURCE, "Hook initialized.");
    return () => {
      logger.log(LOG_SOURCE, "Hook unmounting, ensuring session is ended.");
      end();
    };
  }, [end]);

  return {
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
  };
};
