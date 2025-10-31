import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
// FIX: Removed `LiveSession` as it is not an exported member of '@google/genai'.
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAI_Blob, FunctionDeclaration, Type } from '@google/genai';
import { Slide, LectureSessionState, TranscriptEntry } from '../types';
import { encode, decode, decodeAudioData } from '../services/audioUtils';
import { logger } from '../services/logger';

const LOG_SOURCE = 'useGeminiLive';

interface UseGeminiLiveProps {
  slides: Slide[];
  generalInfo: string;
  transcript: TranscriptEntry[];
  setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>;
  isMuted: boolean;
  selectedLanguage: string;
  selectedVoice: string;
  selectedModel: string;
  onSlideChange: (slideNumber: number) => void;
  apiKey: string | null;
  currentSlideIndex: number;
}

const setActiveSlideFunctionDeclaration: FunctionDeclaration = {
  name: 'setActiveSlide',
  description: 'Sets the active presentation slide to the specified slide number. Use this function to navigate the presentation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      slideNumber: {
        type: Type.NUMBER,
        description: 'The number of the slide to display. Note: Slide numbers are 1-based.',
      },
    },
    required: ['slideNumber'],
  },
};

export const useGeminiLive = ({ slides, generalInfo, transcript, setTranscript, isMuted, selectedLanguage, selectedVoice, selectedModel, onSlideChange, apiKey, currentSlideIndex }: UseGeminiLiveProps) => {
  const [sessionState, _setSessionState] = useState<LectureSessionState>(LectureSessionState.IDLE);
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

  const setSessionState = (newState: LectureSessionState) => {
    _setSessionState(prevState => {
        if (prevState !== newState) {
            logger.debug(LOG_SOURCE, `Session state changing from ${prevState} to ${newState}`);
        }
        return newState;
    });
  };

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);


  const cleanupConnectionResources = useCallback(() => {
    logger.log(LOG_SOURCE, 'Cleaning up connection resources.');
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
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
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => logger.warn(LOG_SOURCE, 'Error closing input audio context', e));
        audioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close().catch(e => logger.warn(LOG_SOURCE, 'Error closing output audio context', e));
        outputAudioContextRef.current = null;
    }
    if (sessionPromiseRef.current) {
        logger.debug(LOG_SOURCE, 'Closing previous session promise.');
        sessionPromiseRef.current.then(session => session?.close()).catch(() => {});
        sessionPromiseRef.current = null;
    }
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  // FIX: Renamed disconnect to end to match what's being returned and used in LecturePage.
  const end = useCallback(() => {
    logger.log(LOG_SOURCE, 'end() called. Performing full cleanup.');
    cleanupConnectionResources();
    setSessionState(LectureSessionState.ENDED);
  }, [cleanupConnectionResources]);

  const sendTextMessage = useCallback((text: string) => {
    logger.debug(LOG_SOURCE, 'sendTextMessage called.');
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({ text });
        });
    } else {
      logger.warn(LOG_SOURCE, 'sendTextMessage called but session promise is null.');
    }
  }, []);
  
  const sendSlideImageContext = useCallback((slide: Slide) => {
    logger.debug(LOG_SOURCE, `sendSlideImageContext called for slide ${slide.pageNumber}`);
    if (sessionPromiseRef.current) {
      const base64Data = slide.imageDataUrl.split(',')[1];
      if (!base64Data) {
        logger.error(LOG_SOURCE, "Could not extract base64 data from slide image");
        return;
      }
      const imageBlob: GenAI_Blob = {
        data: base64Data,
        mimeType: 'image/png',
      };
      sessionPromiseRef.current.then(session => {
        session.sendRealtimeInput({ media: imageBlob });
      });
    } else {
        logger.warn(LOG_SOURCE, 'sendSlideImageContext called but session promise is null.');
    }
  }, []);


  const startLecture = useCallback(() => {
    logger.log(LOG_SOURCE, 'startLecture() called.');
    if (slides.length === 0) {
      logger.warn(LOG_SOURCE, 'startLecture() called with 0 slides. Aborting.');
      return;
    }

    cleanupConnectionResources();
    setSessionState(LectureSessionState.CONNECTING);
    setError(null);
    
    const ai = new GoogleGenAI({ apiKey: apiKey ?? process.env.API_KEY! });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const isReconnect = transcript.length > 0;

    const sessionConfig = {
      model: selectedModel,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
        tools: [{ functionDeclarations: [setActiveSlideFunctionDeclaration] }],
        systemInstruction: `You are an AI lecturer. Your primary task is to explain a presentation, slide-by-slide, in ${selectedLanguage}.

        **General Information about the presentation:**
        ${generalInfo}
        
        **Context:**
        You will be provided with a summary for each slide. You will also receive an image of the current slide when it becomes active.

        **Workflow:**
        1. Greet the user in ${selectedLanguage}.
        2. Call 'setActiveSlide' for slide 1 to begin.
        3. For each slide, you MUST use the provided summary AND the visual information from the slide's image to deliver a comprehensive explanation. Describe charts, diagrams, and key visual elements seen in the image.
        4. After explaining a slide, wait for the user to proceed. Say something like "Let me know when you're ready to continue." to prompt the user.
        5. If the user asks a question, answer it based on the lecture plan and slide content.

        **Rules:**
        - All speech must be in ${selectedLanguage}.
        - Use the 'setActiveSlide' function to change slides ONLY when instructed by the user (e.g., when they say "next slide" or "go to slide 5").
        - Do NOT say "Moving to the next slide" or similar phrases. The UI will show the slide change. Just start explaining the new content of the requested slide.`,
      },
    };

    logger.debug(LOG_SOURCE, 'Connecting to Gemini Live...');
    
    const sessionPromise = ai.live.connect({
      ...sessionConfig,
      callbacks: {
        onopen: async () => {
          logger.log(LOG_SOURCE, 'Session opened successfully.');
          try {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            logger.debug(LOG_SOURCE, 'Microphone stream acquired.');

            const source = audioContextRef.current.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;

            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              if (isMutedRef.current) return;
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);

              const bufferLength = inputData.length;
              const pcm16 = new Int16Array(bufferLength);
              for (let i = 0; i < bufferLength; i++) {
                pcm16[i] = inputData[i] * 32768;
              }
              
              const pcmBlob: GenAI_Blob = {
                  data: encode(new Uint8Array(pcm16.buffer)),
                  mimeType: 'audio/pcm;rate=16000',
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
            
            const lecturePlanForAI = slides.map(s => (
                `Slide ${s.pageNumber}: ${s.summary}`
            )).join('\n');
            
            if (isReconnect) {
                logger.log(LOG_SOURCE, 'Reconnecting. Sending concise context to resume.');
                const recentHistory = transcript.slice(-4).map(entry => `${entry.speaker === 'user' ? 'User' : 'Lecturer'}: ${entry.text}`).join('\n\n');
                const currentSlideNumber = currentSlideIndex + 1;
                
                // Send the image of the current slide first for visual context.
                sendSlideImageContext(slides[currentSlideIndex]);
                
                // Construct a structured and direct prompt for the AI to resume.
                const contextMessage = `CONTEXT for resuming a disconnected lecture session:
[LECTURE PLAN]:
${lecturePlanForAI}

[RECENT CONVERSATION HISTORY]:
${recentHistory}

[CURRENT SLIDE]: ${currentSlideNumber}

INSTRUCTION: You are the AI lecturer. Your session was just reconnected. Using the context above, please resume the lecture for the current slide from where you left off. Do not greet the user again, just continue the explanation.`;

                sendTextMessage(contextMessage);
            } else {
                const initialMessage = `Here are the summaries for each slide:\n\n${lecturePlanForAI}\n\nNow, please begin the lecture as instructed.`;
                logger.debug(LOG_SOURCE, 'Sending initial context to AI.');
                sendTextMessage(initialMessage);
            }

          } catch (err) {
              logger.error(LOG_SOURCE, 'Microphone access denied or error:', err);
              setError('Microphone access is required. Please allow microphone permissions and refresh.');
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
              logger.debug(LOG_SOURCE, 'Received tool call:', message.toolCall);
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'setActiveSlide') {
                  const slideNumber = fc.args.slideNumber as number;
                  logger.log(LOG_SOURCE, `Processing setActiveSlide function call for slide number: ${slideNumber}`);
                  if (slideNumber >= 1 && slideNumber <= slides.length) {
                    onSlideChange(slideNumber);
                    sessionPromise.then((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: { result: `OK. Changed to slide ${slideNumber}.` },
                        }
                      });
                    });
                  } else {
                    logger.error(LOG_SOURCE, `AI requested invalid slide number: ${slideNumber}`);
                    sessionPromise.then((session) => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: { error: `Invalid slide number: ${slideNumber}. There are only ${slides.length} slides.` },
                        }
                      });
                    });
                  }
                }
              }
            }

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setTranscript(prev => {
                  const newTranscript = [...prev];
                  const lastEntry = newTranscript[newTranscript.length - 1];
                  if (lastEntry?.speaker === 'user') {
                      lastEntry.text += text;
                  } else {
                      newTranscript.push({ speaker: 'user', text });
                  }
                  return newTranscript;
              });
            }
    
            if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                setTranscript(prev => {
                    const newTranscript = [...prev];
                    const lastEntry = newTranscript[newTranscript.length - 1];
                    if (lastEntry?.speaker === 'ai') {
                        lastEntry.text += text;
                    } else {
                        newTranscript.push({ speaker: 'ai', text });
                    }
                    return newTranscript;
                });
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
                const outputCtx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputCtx.destination);
                source.addEventListener('ended', () => { audioSourcesRef.current.delete(source); });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
                logger.debug(LOG_SOURCE, 'AI speech was interrupted. Clearing audio queue.');
                for (const source of audioSourcesRef.current.values()) {
                    source.stop();
                }
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
        },
        onerror: (e: ErrorEvent) => {
          logger.error(LOG_SOURCE, 'Session error event received.', e);
          setError('A connection error occurred. Please try to reconnect.');
          cleanupConnectionResources();
          setSessionState(LectureSessionState.DISCONNECTED);
        },
        onclose: (e: CloseEvent) => {
          logger.warn(LOG_SOURCE, 'Session close event received. Code:', e.code, 'Reason:', e.reason, 'wasClean:', e.wasClean);
          if (!e.wasClean) {
            setError('The connection was lost unexpectedly. Please reconnect.');
            cleanupConnectionResources();
            setSessionState(LectureSessionState.DISCONNECTED);
          }
        },
      }
    });

    sessionPromiseRef.current = sessionPromise;
  }, [slides, generalInfo, transcript, setTranscript, sendTextMessage, selectedLanguage, selectedVoice, selectedModel, onSlideChange, sendSlideImageContext, apiKey, cleanupConnectionResources, currentSlideIndex]);

  const replay = useCallback(() => {
    logger.debug(LOG_SOURCE, 'replay() called.');
    sendTextMessage("Please repeat your explanation for the current slide.");
  }, [sendTextMessage]);
  const next = useCallback(() => {
    logger.debug(LOG_SOURCE, 'next() called.');
    sendTextMessage("Go to the next slide.");
  }, [sendTextMessage]);
  const previous = useCallback(() => {
    logger.debug(LOG_SOURCE, 'previous() called.');
    sendTextMessage("Go back to the previous slide.");
  }, [sendTextMessage]);
  const goToSlide = useCallback((slideNumber: number) => {
    logger.debug(LOG_SOURCE, `goToSlide(${slideNumber}) called.`);
    sendTextMessage(`Please jump to slide number ${slideNumber}.`);
  }, [sendTextMessage]);

  useEffect(() => {
    logger.log(LOG_SOURCE, 'Hook initialized.');
    return () => {
      logger.log(LOG_SOURCE, 'Hook unmounting, ensuring session is ended.');
      end();
    };
  }, [end]);

  return { sessionState, startLecture, replay, next, previous, end, error, goToSlide, sendTextMessage, sendSlideImageContext };
};
