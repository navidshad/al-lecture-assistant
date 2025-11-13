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
  ChatAttachment,
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

const provideCanvasMarkdownFunctionDeclaration: FunctionDeclaration = {
  name: "provideCanvasMarkdown",
  description:
    "Render markdown content on the canvas. Supports GFM, KaTeX math ($ and $$), Mermaid diagrams (```mermaid), emojis, code highlighting, tables, and all standard markdown features.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      markdown: {
        type: Type.STRING,
        description:
          "Raw markdown string containing text, math, diagrams, emojis, etc. Use $...$ for inline math, $$...$$ for block math, and ```mermaid ... ``` for Mermaid diagrams.",
      },
    },
    required: ["markdown"],
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

  // Helper function to add a message to the transcript with validation
  const addTranscriptEntry = useCallback(
    (
      text: string,
      speaker: "user" | "ai",
      options?: {
        slideNumber?: number;
        attachments?: ChatAttachment[];
        updateLastEntry?: boolean;
      }
    ) => {
      const trimmed = text.trim();
      // Skip empty messages
      if (!trimmed) {
        return;
      }

      const slideNumber =
        options?.slideNumber ?? currentSlideIndexRef.current + 1;

      setTranscript((prev) => {
        const newTranscript = [...prev];
        const lastEntry = newTranscript[newTranscript.length - 1];

        // Handle updating existing entry (for streaming transcriptions)
        if (options?.updateLastEntry && lastEntry?.speaker === speaker) {
          const trimmedText = trimmed;
          // Skip if this chunk already appears at the end of the last entry
          if ((lastEntry.text || "").endsWith(trimmedText)) {
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
          // Ensure slide number is set
          if (!lastEntry.slideNumber) {
            lastEntry.slideNumber = slideNumber;
          }
        } else {
          // Add new entry
          newTranscript.push({
            speaker,
            text,
            slideNumber,
            attachments: options?.attachments,
          });
          if (speaker === "ai") {
            aiMessageOpenRef.current = true;
          }
        }
        return newTranscript;
      });
    },
    [setTranscript]
  );

  type SendMessageOptions = {
    slide?: Slide;
    text?: string | string[];
    attachments?: ChatAttachment[];
    turnComplete?: boolean;
  };

  const sendMessage = useCallback((options: SendMessageOptions) => {
    logger.debug(LOG_SOURCE, "sendMessage called.");
    if (!sessionOpenRef.current) {
      logger.warn(
        LOG_SOURCE,
        "Attempted to send but session is not open. Ignoring."
      );
      return;
    }
    const { slide, text, attachments } = options;
    const turnComplete = options.turnComplete ?? true;
    const parts: any[] = [];
    if (slide) {
      const base64Data = slide.imageDataUrl.split(",")[1];
      if (base64Data) {
        parts.push({
          inlineData: { mimeType: "image/png", data: base64Data },
        });
      }
      if (slide.canvasContent && slide.canvasContent.length > 0) {
        parts.push({
          text: `Context: The canvas for this slide currently contains the following content blocks, which you or the user created earlier. Use this information in your explanation. Canvas Content: ${JSON.stringify(
            slide.canvasContent
          )}`,
        });
      }
    }

    // Process attachments (only images are supported)
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.type === "image" || attachment.type === "selection") {
          // Image attachments (including selections)
          const base64Data = attachment.data.split(",")[1];
          if (base64Data) {
            parts.push({
              inlineData: {
                mimeType: attachment.mimeType || "image/png",
                data: base64Data,
              },
            });
          }
        }
        // Only images are supported, ignore other types
      }
    }

    if (typeof text === "string") {
      parts.push({ text });
    } else if (Array.isArray(text)) {
      for (const t of text) {
        parts.push({ text: t });
      }
    }
    if (parts.length === 0) {
      logger.warn(
        LOG_SOURCE,
        "sendMessage called with no parts to send. Ignoring."
      );
      return;
    }
    runWithOpenSession((session) => {
      try {
        session.sendClientContent?.({
          turns: [{ role: "user", parts }],
          turnComplete,
        });
      } catch (e) {
        logger.warn(
          LOG_SOURCE,
          "sendClientContent failed in sendMessage; falling back to realtime inputs.",
          e as any
        );
        try {
          for (const p of parts) {
            if (p.inlineData) {
              session.sendRealtimeInput({
                media: {
                  data: p.inlineData.data,
                  mimeType: p.inlineData.mimeType,
                },
              });
            } else if (typeof p.text === "string") {
              session.sendRealtimeInput({ text: p.text });
            }
          }
          if (turnComplete) {
            session.sendRealtimeInput?.({ event: "end_of_turn" });
          }
        } catch {}
      }
    });
  }, []);

  // (removed) sendSlideImageContext – unified into sendMessage

  const buildSlideMemory = useCallback(
    (
      entries: TranscriptEntry[],
      slideNumber: number,
      maxMessages: number = 8,
      maxChars: number = 1800
    ) => {
      // Filter entries to only those belonging to the active slide
      const filtered = entries.filter(
        (e) =>
          (e.slideNumber ?? currentSlideIndexRef.current + 1) === slideNumber
      );
      // Get the most recent messages (limit to 5-10, default 8)
      const recent = filtered.slice(-maxMessages);
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
      const keyTurns = buildSlideMemory(transcriptNow, slideNo, 8, 1800);
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
    [buildSlideMemory, sendMessage]
  );

  const buildSlideAnchorText = useCallback(
    (slide: Slide, transcriptNow: TranscriptEntry[]) => {
      const keyTurns = buildSlideMemory(
        transcriptNow,
        slide.pageNumber,
        8,
        1800
      );
      return [
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
    },
    [buildSlideMemory]
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
      const anchor = buildSlideAnchorText(slide, transcript);
      sendMessage({ slide, text: anchor, turnComplete: true });
    },
    [flushOutput, buildSlideAnchorText, sendMessage, transcript]
  );

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

      // Bump sequence to tag this connection as the latest one
      const thisConnectSeq = ++connectSeqRef.current;

      const ai = new GoogleGenAI({ apiKey: apiKey ?? process.env.API_KEY! });
      outputAudioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // Determine reconnection type: if not provided, infer from transcript
      const isReconnect = transcript.length > 0;
      const reconnectType = reconnectionType || (isReconnect ? "saved" : "new");

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
                provideCanvasMarkdownFunctionDeclaration,
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
        - **Function Call Response Handling:** After a tool call is confirmed as successful, do not repeat your previous statement. For example, if you state you are rendering a diagram and the \`provideCanvasMarkdown\` tool call is successful, do not announce it again. Acknowledge the success silently and continue the conversation naturally.
        - When you see an anchor line \`ACTIVE SLIDE: N\` or after a successful \`setActiveSlide\` tool call, immediately switch context to slide N and continue ONLY with that slide. Do not finish or reference the previous slide unless asked.
        - If the user asks about another slide without switching, give a brief teaser and ask whether to switch. Do not change slides or fully explain it until confirmed.
        
        **Style:**
        - Speak naturally like a confident human instructor guiding a class.
        - Do NOT use meta phrases about slides (e.g., "in this slide", "this slide shows", "on slide N"). Start directly with the explanation.
        - Avoid filler/openers like "we will", "let's", "here we", "the following". Be direct and conversational.
        - Use clear transitions and, where helpful, short rhetorical questions to keep engagement high.
        - Prefer present tense and plain language unless the user requests otherwise.
        
        **Canvas for Clarification (Advanced):**
        - You have a powerful tool: 'provideCanvasMarkdown'. Use it proactively to enhance your explanations when the slide content is not enough, or when the user asks a question that would benefit from a visual aid.
        - This function accepts a single 'markdown' parameter containing raw markdown text.
        
        - **Supported Markdown Features:**
          1.  Standard markdown: headings, lists, bold, italic, links, images, tables
          2.  GitHub Flavored Markdown (GFM): task lists, strikethrough, autolinks
          3.  Math: Use $...$ for inline math and $$...$$ for block math (KaTeX)
          4.  Mermaid diagrams: Use \`\`\`mermaid code fences for flowcharts, sequence diagrams, etc.
          5.  Code highlighting: Use \`\`\`language code fences for syntax-highlighted code
          6.  Emojis: Use :emoji: syntax or unicode emojis
        
        - **Example Usage:**
          If a user asks for a comparison with math and a diagram, provide markdown like:
          { "markdown": "# Comparison\\n\\nFormula: $E = mc^2$\\n\\nMermaid diagram: code fence with mermaid language tag followed by diagram syntax" }
        
        - **When to Use the Canvas:**
          - To explain complex concepts that are hard to describe with words alone
          - To show code snippets with syntax highlighting
          - To draw diagrams (flowcharts, sequence diagrams, etc.) using Mermaid
          - To display mathematical formulas and equations
          - To provide formatted lists, tables, or step-by-step instructions
        
        - **Crucially:** After calling 'provideCanvasMarkdown', you MUST inform the user. Say something like, "I've put a diagram on the canvas to illustrate that for you," or "Take a look at the canvas for the code example." This guides the user to the new visual information.`,
        },
      };

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
                    const anchor = buildSlideAnchorText(slide, transcript);
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
            // Ignore errors from older connections
            if (thisConnectSeq !== connectSeqRef.current) {
              return;
            }
            logger.error(LOG_SOURCE, "Session error event received.", e);
            sessionOpenRef.current = false;
            setError("A connection error occurred. Please try to reconnect.");
            cleanupConnectionResources();
            setSessionState(LectureSessionState.DISCONNECTED);
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
            // Regardless of clean/unclean close, stop streaming and require reconnect
            sessionOpenRef.current = false;
            if (!e.wasClean) {
              setError(
                "The connection was lost unexpectedly. Please reconnect."
              );
            }
            cleanupConnectionResources();
            setSessionState(LectureSessionState.DISCONNECTED);
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
    const anchor = buildSlideAnchorText(slide, transcript);
    sendMessage({ slide, text: anchor, turnComplete: true });
  }, [
    sendMessage,
    flushOutput,
    buildSlideAnchorText,
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
    const anchor = buildSlideAnchorText(slide, transcript);
    sendMessage({ slide, text: anchor, turnComplete: true });
  }, [
    sendMessage,
    flushOutput,
    buildSlideAnchorText,
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
      const anchor = buildSlideAnchorText(slide, transcript);
      sendMessage({ slide, text: anchor, turnComplete: true });
    },
    [
      sendMessage,
      flushOutput,
      buildSlideAnchorText,
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
