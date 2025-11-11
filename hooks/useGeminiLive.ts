import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";
// FIX: Removed `LiveSession` as it is not an exported member of '@google/genai'.
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Blob as GenAI_Blob,
  FunctionDeclaration,
  Type,
} from "@google/genai";
import {
  Slide,
  LectureSessionState,
  TranscriptEntry,
  CanvasBlock,
} from "../types";
import { encode, decode, decodeAudioData } from "../services/audioUtils";
import { logger } from "../services/logger";

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
  onRenderCanvas: (contentBlocks: CanvasBlock[]) => void;
  apiKey: string | null;
  currentSlideIndex: number;
}

const setActiveSlideFunctionDeclaration: FunctionDeclaration = {
  name: "setActiveSlide",
  description:
    "Sets the active presentation slide to the specified slide number. Use this function to navigate the presentation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      slideNumber: {
        type: Type.NUMBER,
        description:
          "The number of the slide to display. Note: Slide numbers are 1-based.",
      },
    },
    required: ["slideNumber"],
  },
};

const renderCanvasFunctionDeclaration: FunctionDeclaration = {
  name: "renderCanvas",
  description:
    "Renders a structured list of content blocks on a canvas area to provide visual clarification or extra information. Use this to draw diagrams, show code, write formulas, or create text-based illustrations.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      contentBlocks: {
        type: Type.ARRAY,
        description:
          "An array of content blocks to render sequentially on the canvas.",
        items: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              description:
                "The type of content. Supported values: 'markdown', 'diagram', 'ascii', 'table'.",
            },
            content: {
              type: Type.STRING,
              description:
                "The content for the block. For 'markdown', this is a Markdown string. For 'diagram', this is a Mermaid.js syntax string. For 'ascii', this is a text-based illustration. For 'table', it is a Markdown-formatted table string.",
            },
          },
          required: ["type", "content"],
        },
      },
    },
    required: ["contentBlocks"],
  },
};

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
  const [sessionState, _setSessionState] = useState<LectureSessionState>(
    LectureSessionState.IDLE
  );
  const [error, setError] = useState<string | null>(null);

  // FIX: Replaced `Promise<LiveSession>` with `Promise<any>` as `LiveSession` is not exported.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const isMutedRef = useRef(isMuted);
  const aiMessageOpenRef = useRef(false);
  const currentSlideIndexRef = useRef(currentSlideIndex);

  const setSessionState = (newState: LectureSessionState) => {
    _setSessionState((prevState) => {
      if (prevState !== newState) {
        logger.debug(
          LOG_SOURCE,
          `Session state changing from ${prevState} to ${newState}`
        );
      }
      return newState;
    });
  };

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
  }, [currentSlideIndex]);

  const cleanupConnectionResources = useCallback(() => {
    logger.log(LOG_SOURCE, "Cleaning up connection resources.");
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current
        .close()
        .catch((e) =>
          logger.warn(LOG_SOURCE, "Error closing input audio context", e)
        );
      audioContextRef.current = null;
    }
    if (
      outputAudioContextRef.current &&
      outputAudioContextRef.current.state !== "closed"
    ) {
      outputAudioContextRef.current
        .close()
        .catch((e) =>
          logger.warn(LOG_SOURCE, "Error closing output audio context", e)
        );
      outputAudioContextRef.current = null;
    }
    if (sessionPromiseRef.current) {
      logger.debug(LOG_SOURCE, "Closing previous session promise.");
      sessionPromiseRef.current
        .then((session) => session?.close())
        .catch(() => {});
      sessionPromiseRef.current = null;
    }
    audioSourcesRef.current.forEach((source) => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  // FIX: Renamed disconnect to end to match what's being returned and used in LecturePage.
  const end = useCallback(() => {
    logger.log(LOG_SOURCE, "end() called. Performing full cleanup.");
    cleanupConnectionResources();
    setSessionState(LectureSessionState.ENDED);
  }, [cleanupConnectionResources]);

  const sendTextMessage = useCallback((text: string) => {
    logger.debug(LOG_SOURCE, "sendTextMessage called.");
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session) => {
        session.sendRealtimeInput({ text });
      });
    } else {
      logger.warn(
        LOG_SOURCE,
        "sendTextMessage called but session promise is null."
      );
    }
  }, []);

  const sendSlideImageContext = useCallback((slide: Slide) => {
    logger.debug(
      LOG_SOURCE,
      `sendSlideImageContext called for slide ${slide.pageNumber}`
    );
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session) => {
        const base64Data = slide.imageDataUrl.split(",")[1];
        if (!base64Data) {
          logger.error(
            LOG_SOURCE,
            "Could not extract base64 data from slide image"
          );
          return;
        }
        const imageBlob: GenAI_Blob = {
          data: base64Data,
          mimeType: "image/png",
        };
        // Send image first
        session.sendRealtimeInput({ media: imageBlob });

        // If there's canvas content, send it as text context
        if (slide.canvasContent && slide.canvasContent.length > 0) {
          const canvasText = `Context: The canvas for this slide currently contains the following content blocks, which you or the user created earlier. Use this information in your explanation. Canvas Content: ${JSON.stringify(
            slide.canvasContent
          )}`;
          session.sendRealtimeInput({ text: canvasText });
        }
      });
    } else {
      logger.warn(
        LOG_SOURCE,
        "sendSlideImageContext called but session promise is null."
      );
    }
  }, []);

  const requestExplanation = useCallback(
    (slide: Slide) => {
      logger.debug(
        LOG_SOURCE,
        `requestExplanation called for slide ${slide.pageNumber}`
      );
      sendSlideImageContext(slide);
      const contextMessage = `**USER ACTION: MANUAL SLIDE CHANGE**\nThe user has manually selected and is now viewing slide number ${slide.pageNumber}. Your task is to explain the content of this new slide.`;
      sendTextMessage(contextMessage);
    },
    [sendSlideImageContext, sendTextMessage]
  );

  const startLecture = useCallback(() => {
    logger.log(LOG_SOURCE, "startLecture() called.");
    if (slides.length === 0) {
      logger.warn(LOG_SOURCE, "startLecture() called with 0 slides. Aborting.");
      return;
    }

    cleanupConnectionResources();
    setSessionState(LectureSessionState.CONNECTING);
    setError(null);

    const ai = new GoogleGenAI({ apiKey: apiKey ?? process.env.API_KEY! });
    outputAudioContextRef.current = new (window.AudioContext ||
      (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const isReconnect = transcript.length > 0;

    const sessionConfig = {
      model: selectedModel,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
        },
        tools: [
          {
            functionDeclarations: [
              setActiveSlideFunctionDeclaration,
              renderCanvasFunctionDeclaration,
            ],
          },
        ],
        systemInstruction: `You are an AI lecturer. Your primary task is to explain a presentation, slide-by-slide, in ${selectedLanguage}.

        **General Information about the presentation:**
        ${generalInfo}
        
        ${
          userCustomPrompt ? `**User Preferences:**\n${userCustomPrompt}\n` : ``
        }

        **Context:**
        You will be provided with a summary for each slide. You will also receive an image of the current slide when it becomes active. You may also receive text context about content on a 'canvas' for the current slide.

        **Workflow:**
        1. The application will set the first slide. Greet the user in ${selectedLanguage} and begin by explaining the content of slide 1.
        2. For each slide, you MUST use the provided summary, the visual information from the slide's image, AND any provided canvas content to deliver a comprehensive explanation. Describe charts, diagrams, and key visual elements.
        3. After explaining a slide, wait for the user to proceed. Say something like "Let me know when you're ready to continue." to prompt the user.
        4. If the user asks a question, answer it based on the lecture plan and slide content.

        **Rules:**
        - All speech must be in ${selectedLanguage}.
        - Use the 'setActiveSlide' function to change slides ONLY when instructed by the user (e.g., when they say "next slide" or "go to slide 5").
        - CRITICAL: After successfully changing slides via 'setActiveSlide', you MUST immediately start explaining the new slide's content without waiting for any user prompt.
        - Do NOT say "Moving to the next slide" or similar phrases. The UI will show the slide change. Just start explaining the new content of the requested slide.
        - When presenting tabular data on the canvas, you MUST use a 'contentBlock' with type 'table'. Do not put tables inside 'markdown' blocks.
        - **Function Call Response Handling:** After a tool call is confirmed as successful, do not repeat your previous statement. For example, if you state you are rendering a diagram and the \`renderCanvas\` tool call is successful, do not announce it again. Acknowledge the success silently and continue the conversation naturally.
        
        **Style:**
        - Speak naturally like a confident human instructor guiding a class.
        - Do NOT use meta phrases about slides (e.g., "in this slide", "this slide shows", "on slide N"). Start directly with the explanation.
        - Avoid filler/openers like "we will", "let's", "here we", "the following". Be direct and conversational.
        - Use clear transitions and, where helpful, short rhetorical questions to keep engagement high.
        - Prefer present tense and plain language unless the user requests otherwise.
        
        **Canvas for Clarification (Advanced):**
        - You have a powerful tool: 'renderCanvas'. Use it proactively to enhance your explanations when the slide content is not enough, or when the user asks a question that would benefit from a visual aid.
        - This function accepts a JSON object with a single key, 'contentBlocks', which is an array of objects.
        
        - **Supported 'type' values are:**
          1.  'markdown': For formatted text, lists, and simple text. The 'content' should be a Markdown string.
          2.  'diagram': For creating diagrams. The 'content' MUST be a valid Mermaid.js syntax string. Use this to illustrate processes, hierarchies, or relationships.
          3.  'ascii': For text-based illustrations or sketches. The 'content' should be the ASCII art, which will be rendered in a monospace font.
          4.  'table': For displaying tabular data. The 'content' MUST be a standard Markdown table string (using pipes | and hyphens -).
        
        - **Example Usage:**
          If a user asks for a comparison, you could respond with a Markdown list and a Mermaid diagram:
          { "contentBlocks": [ { "type": "markdown", "content": "Here is a comparison:" }, { "type": "diagram", "content": "graph TD; A-->B; A-->C;" } ] }
        
        - **When to Use the Canvas:**
          - To explain complex concepts that are hard to describe with words alone.
          - To show code snippets (use a 'markdown' block with \`\`\`).
          - To draw diagrams (e.g., flowcharts, sequence diagrams) using Mermaid syntax.
          - To provide lists, tables, or step-by-step instructions.
        
        - **Crucially:** After calling 'renderCanvas', you MUST inform the user. Say something like, "I've put a diagram on the canvas to illustrate that for you," or "Take a look at the canvas for the code example." This guides the user to the new visual information.`,
      },
    };

    logger.debug(LOG_SOURCE, "Connecting to Gemini Live...");

    const sessionPromise = ai.live.connect({
      ...sessionConfig,
      callbacks: {
        onopen: async () => {
          logger.log(LOG_SOURCE, "Session opened successfully.");
          try {
            audioContextRef.current = new (window.AudioContext ||
              (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
            mediaStreamRef.current = stream;
            logger.debug(LOG_SOURCE, "Microphone stream acquired.");

            const source =
              audioContextRef.current.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;

            const scriptProcessor =
              audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              if (isMutedRef.current) return;
              const inputData =
                audioProcessingEvent.inputBuffer.getChannelData(0);

              const bufferLength = inputData.length;
              const pcm16 = new Int16Array(bufferLength);
              for (let i = 0; i < bufferLength; i++) {
                pcm16[i] = inputData[i] * 32768;
              }

              const pcmBlob: GenAI_Blob = {
                data: encode(new Uint8Array(pcm16.buffer)),
                mimeType: "audio/pcm;rate=16000",
              };

              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 0;
            source.connect(scriptProcessor);
            scriptProcessor.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);

            setSessionState(LectureSessionState.READY);

            const lecturePlanForAI = slides
              .map((s) => `Slide ${s.pageNumber}: ${s.summary}`)
              .join("\n");

            if (isReconnect) {
              logger.log(
                LOG_SOURCE,
                "Reconnecting. Sending concise context to resume."
              );
              const recentHistory = transcript
                .slice(-4)
                .map(
                  (entry) =>
                    `${entry.speaker === "user" ? "User" : "Lecturer"}: ${
                      entry.text
                    }`
                )
                .join("\n\n");
              const currentSlideNumber = currentSlideIndex + 1;

              // Send the image of the current slide first for visual context.
              sendSlideImageContext(slides[currentSlideIndex]);

              // Construct a more direct and forceful prompt for the AI to resume.
              const contextMessage = `**URGENT INSTRUCTION: RESUME LECTURE FROM DISCONNECT**
Your session has just been reconnected. All previous state is reset.

**CRITICAL CONTEXT:**
- The user is now viewing **Slide ${currentSlideNumber}**. The slide's image has been provided to you.
- The recent conversation history is:
${recentHistory}

**YOUR IMMEDIATE TASK:**
Resume the lecture from exactly where you left off on Slide ${currentSlideNumber}. Do not greet the user or re-introduce the topic. Start explaining the content of the current slide immediately.`;

              sendTextMessage(contextMessage);
            } else {
              // For a new lecture, send context and instructions separately for clarity.
              sendSlideImageContext(slides[0]);

              // First, send the lecture plan as context.
              const contextMessage = `CONTEXT: The lecture plan is as follows:\n${lecturePlanForAI}\n\nEND OF CONTEXT.`;
              sendTextMessage(contextMessage);

              // Then, send a clear instruction to begin.
              const instructionMessage = `INSTRUCTION: You are on slide 1. Please begin the lecture now. Greet the user and then explain the content of this first slide.`;
              sendTextMessage(instructionMessage);
              logger.debug(
                LOG_SOURCE,
                "Sent initial context and instruction to AI for a new lecture."
              );
            }
          } catch (err) {
            logger.error(LOG_SOURCE, "Microphone access denied or error:", err);
            setError(
              "Microphone access is required. Please allow microphone permissions and refresh."
            );
            setSessionState(LectureSessionState.ERROR);
            end();
          }
        },
        onmessage: async (message: LiveServerMessage) => {
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
                  onSlideChange(slideNumber);
                  sendSlideImageContext(slides[slideNumber - 1]);
                  sessionPromise.then((session) => {
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
                  sessionPromise.then((session) => {
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
              } else if (fc.name === "renderCanvas") {
                let parsedArgs = fc.args;
                if (typeof parsedArgs === "string") {
                  try {
                    parsedArgs = JSON.parse(parsedArgs);
                  } catch (e) {
                    logger.error(
                      LOG_SOURCE,
                      "Failed to parse stringified function call arguments for renderCanvas",
                      e
                    );
                    sessionPromise.then((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error: `Invalid arguments format: failed to parse JSON string.`,
                          },
                        },
                      });
                    });
                    continue;
                  }
                }

                const contentBlocks =
                  parsedArgs?.contentBlocks as CanvasBlock[];

                if (contentBlocks && Array.isArray(contentBlocks)) {
                  logger.log(
                    LOG_SOURCE,
                    `Processing renderCanvas function call.`
                  );
                  onRenderCanvas(contentBlocks);
                  sessionPromise.then((session) => {
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
                  logger.error(
                    LOG_SOURCE,
                    `Invalid 'contentBlocks' received in renderCanvas call`,
                    parsedArgs
                  );
                  sessionPromise.then((session) => {
                    session.sendToolResponse({
                      functionResponses: {
                        id: fc.id,
                        name: fc.name,
                        response: {
                          error: `Invalid arguments: 'contentBlocks' was missing or not an array.`,
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
            setTranscript((prev) => {
              const newTranscript = [...prev];
              const lastEntry = newTranscript[newTranscript.length - 1];
              if (lastEntry?.speaker === "user") {
                const trimmed = text.trim();
                // Skip if this chunk already appears at the end of the last user entry
                if ((lastEntry.text || "").endsWith(trimmed)) {
                  return prev;
                }
                // Replace with latest transcript-so-far to avoid duplicate words
                const prevText = lastEntry.text || "";
                if (text.startsWith(prevText)) {
                  lastEntry.text = text;
                } else if (prevText.startsWith(text)) {
                  // keep prevText (no change)
                } else {
                  // fallback: append if server is sending pure deltas
                  lastEntry.text = prevText + text;
                }
              } else {
                newTranscript.push({ speaker: "user", text });
              }
              return newTranscript;
            });
          }

          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setTranscript((prev) => {
              const newTranscript = [...prev];
              const lastEntry = newTranscript[newTranscript.length - 1];
              if (aiMessageOpenRef.current && lastEntry?.speaker === "ai") {
                const trimmed = text.trim();
                // Skip if this chunk already appears at the end of the last AI entry
                if ((lastEntry.text || "").endsWith(trimmed)) {
                  return prev;
                }
                // Replace with latest transcript-so-far to avoid duplicate words
                const prevText = lastEntry.text || "";
                if (text.startsWith(prevText)) {
                  lastEntry.text = text;
                } else if (prevText.startsWith(text)) {
                  // keep prevText (no change)
                } else {
                  // fallback: append if server is sending pure deltas
                  lastEntry.text = prevText + text;
                }
              } else {
                newTranscript.push({
                  speaker: "ai",
                  text,
                  slideNumber: currentSlideIndexRef.current + 1,
                });
                aiMessageOpenRef.current = true;
              }
              return newTranscript;
            });
          }

          const audioData =
            message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioData && outputAudioContextRef.current) {
            const outputCtx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(
              nextStartTimeRef.current,
              outputCtx.currentTime
            );
            const audioBuffer = await decodeAudioData(
              decode(audioData),
              outputCtx,
              24000,
              1
            );
            const source = outputCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputCtx.destination);
            source.addEventListener("ended", () => {
              audioSourcesRef.current.delete(source);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            audioSourcesRef.current.add(source);
          }

          if (message.serverContent?.generationComplete) {
            // Primary delimiter: model finished generating this response
            aiMessageOpenRef.current = false;
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
            for (const source of audioSourcesRef.current.values()) {
              source.stop();
            }
            audioSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            // Treat interruption as end of current message box
            aiMessageOpenRef.current = false;
          }
        },
        onerror: (e: ErrorEvent) => {
          logger.error(LOG_SOURCE, "Session error event received.", e);
          setError("A connection error occurred. Please try to reconnect.");
          cleanupConnectionResources();
          setSessionState(LectureSessionState.DISCONNECTED);
        },
        onclose: (e: CloseEvent) => {
          logger.warn(
            LOG_SOURCE,
            "Session close event received. Code:",
            e.code,
            "Reason:",
            e.reason,
            "wasClean:",
            e.wasClean
          );
          if (!e.wasClean) {
            setError("The connection was lost unexpectedly. Please reconnect.");
            cleanupConnectionResources();
            setSessionState(LectureSessionState.DISCONNECTED);
          }
        },
      },
    });

    sessionPromiseRef.current = sessionPromise;
  }, [
    slides,
    generalInfo,
    transcript,
    setTranscript,
    sendTextMessage,
    selectedLanguage,
    selectedVoice,
    selectedModel,
    userCustomPrompt,
    onSlideChange,
    onRenderCanvas,
    sendSlideImageContext,
    apiKey,
    cleanupConnectionResources,
    currentSlideIndex,
  ]);

  const replay = useCallback(() => {
    logger.debug(LOG_SOURCE, "replay() called.");
    sendTextMessage("Please repeat your explanation for this slide.");
  }, [sendTextMessage]);
  const next = useCallback(() => {
    logger.debug(LOG_SOURCE, "next() called.");
    sendTextMessage("Go to the next slide and explain it.");
  }, [sendTextMessage]);
  const previous = useCallback(() => {
    logger.debug(LOG_SOURCE, "previous() called.");
    sendTextMessage("Go to the previous slide and explain it.");
  }, [sendTextMessage]);
  const goToSlide = useCallback(
    (slideNumber: number) => {
      logger.debug(LOG_SOURCE, `goToSlide(${slideNumber}) called.`);
      sendTextMessage(`Go to slide number ${slideNumber} and explain it.`);
    },
    [sendTextMessage]
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
    sendTextMessage,
    requestExplanation,
  };
};
