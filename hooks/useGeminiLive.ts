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

const normalizeCanvasBlocks = (input: any): CanvasBlock[] => {
  // Markdown-only normalization
  const coerceToMarkdown = (item: any): CanvasBlock | null => {
    if (item == null) return null;
    if (typeof item === "string") {
      return { type: "markdown", content: item };
    }
    if (typeof item === "object") {
      const possibleContent =
        typeof item.content === "string"
          ? item.content
          : JSON.stringify(item, null, 2);
      return { type: "markdown", content: possibleContent };
    }
    return { type: "markdown", content: String(item) };
  };

  if (
    input &&
    !Array.isArray(input) &&
    (typeof input === "object" || typeof input === "string")
  ) {
    const coerced = coerceToMarkdown(input);
    return coerced ? [coerced] : [];
  }

  if (Array.isArray(input)) {
    return (input.map(coerceToMarkdown).filter(Boolean) as CanvasBlock[]) || [];
  }

  return [
    {
      type: "markdown",
      content:
        typeof input === "string" ? input : JSON.stringify(input, null, 2),
    },
  ];
};

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
    "Render additional information on the canvas as pure Markdown blocks only. Do not use any third‑party extensions or embedded syntaxes (e.g., Mermaid diagrams, KaTeX/LaTeX math, HTML/SVG, images, or tables). Provide only plain Markdown text in 'content'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      contentBlocks: {
        type: Type.ARRAY,
        description:
          "An array of markdown blocks to render sequentially on the canvas.",
        items: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              description: "Must be 'markdown'.",
            },
            content: {
              type: Type.STRING,
              description: "The markdown string for the block.",
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
  // Track if the underlying websocket/session is open to prevent sending on a closed socket
  const sessionOpenRef = useRef(false);
  // Sequence guard for slide-change related async sends
  const slideChangeSeqRef = useRef(0);
  // Counter for periodic re-anchoring during long conversations
  const turnCounterRef = useRef(0);
  // Tunables
  const REANCHOR_EVERY_N_TURNS = 6; // set 0 to disable
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
    sessionOpenRef.current = false;
    cleanupConnectionResources();
    setSessionState(LectureSessionState.ENDED);
  }, [cleanupConnectionResources]);

  const ENABLE_SERVER_INTERRUPT = true;
  const flushOutput = useCallback(() => {
    // stop queued TTS locally
    for (const source of audioSourcesRef.current.values()) {
      try {
        source.stop();
      } catch {}
    }
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    // Treat as end of current AI message box
    aiMessageOpenRef.current = false;
    // Best-effort server-side interruption if supported (no-op otherwise)
    if (
      ENABLE_SERVER_INTERRUPT &&
      sessionOpenRef.current &&
      sessionPromiseRef.current
    ) {
      sessionPromiseRef.current.then((session) => {
        try {
          session.sendRealtimeInput?.({ event: "response.cancel" });
        } catch {}
      });
    }
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    logger.debug(LOG_SOURCE, "sendTextMessage called.");
    if (!sessionOpenRef.current) {
      logger.warn(
        LOG_SOURCE,
        "Attempted to send text but session is not open. Ignoring."
      );
      return;
    }
    if (!sessionPromiseRef.current) {
      logger.warn(
        LOG_SOURCE,
        "sendTextMessage called but session promise is null."
      );
      return;
    }
    runWithOpenSession((session) => {
      session.sendRealtimeInput({ text });
    });
  }, []);

  const sendSlideImageContext = useCallback((slide: Slide) => {
    logger.debug(
      LOG_SOURCE,
      `sendSlideImageContext called for slide ${slide.pageNumber}`
    );
    const seq = ++slideChangeSeqRef.current;
    if (!sessionOpenRef.current) {
      logger.warn(
        LOG_SOURCE,
        "Attempted to send slide image but session is not open. Ignoring."
      );
      return;
    }
    if (!sessionPromiseRef.current) {
      logger.warn(
        LOG_SOURCE,
        "sendSlideImageContext called but session promise is null."
      );
      return;
    }
    runWithOpenSession((session) => {
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
      if (seq !== slideChangeSeqRef.current) return;
      session.sendRealtimeInput({ media: imageBlob });

      // If there's canvas content, send it as text context
      if (slide.canvasContent && slide.canvasContent.length > 0) {
        const canvasText = `Context: The canvas for this slide currently contains the following content blocks, which you or the user created earlier. Use this information in your explanation. Canvas Content: ${JSON.stringify(
          slide.canvasContent
        )}`;
        if (seq !== slideChangeSeqRef.current) return;
        session.sendRealtimeInput({ text: canvasText });
      }
    });
  }, []);

  const buildSlideMemory = useCallback(
    (
      entries: TranscriptEntry[],
      slideNumber: number,
      maxTurns: number = 12,
      maxChars: number = 1800
    ) => {
      const filtered = entries.filter(
        (e) =>
          (e.slideNumber ?? currentSlideIndexRef.current + 1) === slideNumber
      );
      const recent = filtered.slice(-maxTurns);
      let text = recent
        .map((e) => `${e.speaker === "user" ? "User" : "Lecturer"}: ${e.text}`)
        .join("\n");
      if (text.length > maxChars) {
        text = text.slice(-maxChars);
      }
      return text;
    },
    []
  );

  const sendStrongSlideAnchor = useCallback(
    (slide: Slide, transcriptNow: TranscriptEntry[]) => {
      const slideNo = slide.pageNumber;
      const keyTurns = buildSlideMemory(transcriptNow, slideNo, 12, 1800);
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
      sendTextMessage(anchor);
    },
    [buildSlideMemory, sendTextMessage]
  );

  const sendSlideContextTurn = useCallback(
    (slide: Slide, transcriptNow: TranscriptEntry[]) => {
      logger.debug(
        LOG_SOURCE,
        `sendSlideContextTurn called for slide ${slide.pageNumber}`
      );
      const seq = ++slideChangeSeqRef.current;
      if (!sessionOpenRef.current) {
        logger.warn(
          LOG_SOURCE,
          "Attempted to send slide context but session is not open. Ignoring."
        );
        return;
      }
      if (!sessionPromiseRef.current) {
        logger.warn(
          LOG_SOURCE,
          "sendSlideContextTurn called but session promise is null."
        );
        return;
      }

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

      const keyTurns = buildSlideMemory(
        transcriptNow,
        slide.pageNumber,
        12,
        1800
      );
      const anchor = [
        `ACTIVE SLIDE: ${slide.pageNumber}`,
        slide.summary ? `SUMMARY: ${slide.summary}` : null,
        slide.textContent
          ? `TEXT EXCERPT: ${slide.textContent.slice(0, 1000)}`
          : null,
        keyTurns ? `KEY POINTS SO FAR:\n${keyTurns}` : null,
        `FOCUS: Explain ONLY slide ${slide.pageNumber}.`,
      ]
        .filter(Boolean)
        .join("\n");

      runWithOpenSession((session) => {
        // Image first
        if (seq !== slideChangeSeqRef.current) return;
        session.sendRealtimeInput({ media: imageBlob });

        // Canvas context second (optional)
        if (slide.canvasContent && slide.canvasContent.length > 0) {
          const canvasText = `Context: The canvas for this slide currently contains the following content blocks, which you or the user created earlier. Use this information in your explanation. Canvas Content: ${JSON.stringify(
            slide.canvasContent
          )}`;
          if (seq !== slideChangeSeqRef.current) return;
          session.sendRealtimeInput({ text: canvasText });
        }

        // Anchor last
        if (seq !== slideChangeSeqRef.current) return;
        session.sendRealtimeInput({ text: anchor });

        // End of turn to produce one coherent response
        if (seq !== slideChangeSeqRef.current) return;
        session.sendRealtimeInput({ event: "end_of_turn" });
      });
    },
    [buildSlideMemory, runWithOpenSession]
  );

  const requestExplanation = useCallback(
    (slide: Slide) => {
      logger.debug(
        LOG_SOURCE,
        `requestExplanation called for slide ${slide.pageNumber}`
      );
      // Stop any ongoing output before changing context
      flushOutput();
      sendSlideContextTurn(slide, transcript);
    },
    [flushOutput, sendSlideContextTurn, transcript]
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
        - Focus on the ACTIVE slide. Do not discuss other slides or future content unless the user asks, but you can address content in other slides by mentioning the slide number.
        - If the user asks about a different slide, give a concise answer or teaser and ASK whether to switch: e.g., "Would you like me to jump to slide 7?" Do NOT change slides unless the user explicitly instructs.
        - When asked about another slide, avoid giving the full explanation until you are on that slide. Keep it short and then return to the current slide unless the user confirms switching.
        - When presenting tabular data on the canvas, you MUST use a 'contentBlock' with type 'table'. Do not put tables inside 'markdown' blocks.
        - **Function Call Response Handling:** After a tool call is confirmed as successful, do not repeat your previous statement. For example, if you state you are rendering a diagram and the \`renderCanvas\` tool call is successful, do not announce it again. Acknowledge the success silently and continue the conversation naturally.
        - When you see an anchor line \`ACTIVE SLIDE: N\` or after a successful \`setActiveSlide\` tool call, immediately switch context to slide N and continue ONLY with that slide. Do not finish or reference the previous slide unless asked.
        - If the user asks about another slide without switching, give a brief teaser and ask whether to switch. Do not change slides or fully explain it until confirmed.
        
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
          sessionOpenRef.current = true;
          try {
            audioContextRef.current = new (window.AudioContext ||
              (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
            // It's possible the session was closed while awaiting getUserMedia.
            if (!sessionOpenRef.current) {
              try {
                stream.getTracks().forEach((t) => t.stop());
              } catch {}
              logger.warn(
                LOG_SOURCE,
                "getUserMedia resolved after session closed. Aborting audio init."
              );
              return;
            }
            mediaStreamRef.current = stream;
            logger.debug(LOG_SOURCE, "Microphone stream acquired.");

            const ctx = audioContextRef.current;
            if (!ctx) {
              // Audio context may have been closed by cleanup during a race.
              try {
                stream.getTracks().forEach((t) => t.stop());
              } catch {}
              logger.warn(
                LOG_SOURCE,
                "AudioContext missing during onopen. Aborting audio init."
              );
              return;
            }

            const source = ctx.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;

            const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              // Do not attempt to stream audio if muted or session is not open
              if (isMutedRef.current || !sessionOpenRef.current) return;
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

              runWithOpenSession((session) => {
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
              const currentSlideNumber = currentSlideIndex + 1;
              // Send the image of the current slide first for visual context.
              sendSlideImageContext(slides[currentSlideIndex]);
              // Strongly re-anchor to the current slide
              sendStrongSlideAnchor(slides[currentSlideIndex], transcript);
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
              // Ensure the model starts one coherent response for the initial inputs
              runWithOpenSession((session) => {
                try {
                  session.sendRealtimeInput?.({ event: "end_of_turn" });
                } catch {}
              });
            }
          } catch (err) {
            logger.error(LOG_SOURCE, "Microphone access denied or error:", err);
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
                  // Send all slide context inputs atomically as one turn
                  sendSlideContextTurn(slides[slideNumber - 1], transcript);
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
              } else if (fc.name === "renderCanvas") {
                logger.log(
                  LOG_SOURCE,
                  "renderCanvas raw args:",
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
                      "Failed to parse JSON args for renderCanvas; rendering raw args as ascii"
                    );
                    const fallbackBlocks = normalizeCanvasBlocks(parsedArgs);
                    onRenderCanvas(fallbackBlocks);
                    runWithOpenSession((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            result: `Rendered fallback 'ascii' block from raw string args.`,
                          },
                        },
                      });
                    });
                    continue;
                  }
                }

                logger.log(LOG_SOURCE, "renderCanvas parsed args:", parsedArgs);
                const candidate =
                  (parsedArgs as any)?.contentBlocks ?? parsedArgs;
                logger.log(
                  LOG_SOURCE,
                  "renderCanvas candidate contentBlocks:",
                  candidate
                );
                const contentBlocks = normalizeCanvasBlocks(candidate);
                logger.log(
                  LOG_SOURCE,
                  "renderCanvas normalized markdown blocks:",
                  contentBlocks
                );

                if (contentBlocks.length > 0) {
                  logger.log(
                    LOG_SOURCE,
                    `Processing renderCanvas function call.`
                  );
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
                    `renderCanvas received empty/invalid content; rendering raw args as ascii`,
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
                          result: `Rendered fallback 'ascii' block from invalid args.`,
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
          sessionOpenRef.current = false;
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
          // Regardless of clean/unclean close, stop streaming and require reconnect
          sessionOpenRef.current = false;
          if (!e.wasClean) {
            setError("The connection was lost unexpectedly. Please reconnect.");
          }
          cleanupConnectionResources();
          setSessionState(LectureSessionState.DISCONNECTED);
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
