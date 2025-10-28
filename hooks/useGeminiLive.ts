import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
// FIX: Removed `LiveSession` as it is not an exported member of '@google/genai'.
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAI_Blob, FunctionDeclaration, Type } from '@google/genai';
import { Slide, LectureSessionState, TranscriptEntry } from '../types';
import { encode, decode, decodeAudioData } from '../services/audioUtils';

interface UseGeminiLiveProps {
  slides: Slide[];
  setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>;
  isMuted: boolean;
  selectedLanguage: string;
  selectedVoice: string;
  selectedModel: string;
  onSlideChange: (slideNumber: number) => void;
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

export const useGeminiLive = ({ slides, setTranscript, isMuted, selectedLanguage, selectedVoice, selectedModel, onSlideChange }: UseGeminiLiveProps) => {
  const [sessionState, setSessionState] = useState<LectureSessionState>(LectureSessionState.IDLE);
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
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);


  const disconnect = useCallback(() => {
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
        audioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
    }
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
        sessionPromiseRef.current = null;
    }
    setSessionState(LectureSessionState.ENDED);
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({ text });
        });
    }
  }, []);


  const startLecture = useCallback(() => {
    if (slides.length === 0) return;

    setSessionState(LectureSessionState.CONNECTING);
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const sessionPromise = ai.live.connect({
      model: selectedModel,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
        tools: [{ functionDeclarations: [setActiveSlideFunctionDeclaration] }],
        systemInstruction: `You are an AI lecturer. Your primary task is to explain a presentation, slide-by-slide, in ${selectedLanguage}.

        **Workflow:**
        1. Greet the user in ${selectedLanguage}.
        2. Call 'setActiveSlide' for slide 1 to begin.
        3. Explain the current slide's content.
        4. After finishing your explanation for a slide, you MUST wait for the user to tell you to proceed. Do NOT automatically move to the next slide. You can say something like "Let me know when you're ready for the next slide." to prompt the user.
        5. If the user asks a question, answer it, and then wait for further instructions.

        **Rules:**
        - All speech must be in ${selectedLanguage}.
        - Use the 'setActiveSlide' function to change slides ONLY when instructed by the user (e.g., when they say "next slide" or "go to slide 5").
        - Do NOT say "Moving to the next slide" or similar phrases. The UI will show the slide change. Just start explaining the new content of the requested slide.`,
      },
      callbacks: {
        onopen: async () => {
          try {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const source = audioContextRef.current.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;

            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              if (isMutedRef.current) return;
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: GenAI_Blob = {
                  data: encode(new Uint8Array(int16.buffer)),
                  mimeType: 'audio/pcm;rate=16000',
              };

              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            // Connect the microphone source to the script processor, but prevent feedback loop.
            // A muted gain node is used to connect to the destination, which is required for 
            // the `onaudioprocess` event to fire reliably in some browsers.
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 0;
            source.connect(scriptProcessor);
            scriptProcessor.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            
            setSessionState(LectureSessionState.READY);
            const allSlidesText = slides.map(s => `Slide ${s.pageNumber} Content: "${s.textContent}"`).join('\n\n');
            sendTextMessage(`Here is the content for all the lecture slides:\n${allSlidesText}\n\nNow, please begin the lecture as instructed.`);

          } catch (err) {
              console.error('Microphone access denied or error:', err);
              setError('Microphone access is required. Please allow microphone permissions and refresh.');
              setSessionState(LectureSessionState.ERROR);
              disconnect();
          }
        },
        onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent) {
                setSessionState(LectureSessionState.LECTURING);
            }
            // FIX: Replaced `message.userInput` with `message.serverContent?.inputTranscription` to correctly detect user input.
            if (message.serverContent?.inputTranscription) {
                setSessionState(LectureSessionState.LISTENING);
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'setActiveSlide') {
                  const slideNumber = fc.args.slideNumber as number;
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
                    console.error(`AI requested invalid slide number: ${slideNumber}`);
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

            // Handle transcript
            if (message.serverContent?.outputTranscription) {
                currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.inputTranscription) {
                currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
            }
            if(message.serverContent?.turnComplete) {
                const userInput = currentInputTranscriptionRef.current.trim();
                const aiOutput = currentOutputTranscriptionRef.current.trim();
                setTranscript(prev => {
                    const newTranscript = [...prev];
                    if (userInput) newTranscript.push({ speaker: 'user', text: userInput });
                    if (aiOutput) newTranscript.push({ speaker: 'ai', text: aiOutput });
                    return newTranscript;
                });
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            }

            // Handle audio
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
                for (const source of audioSourcesRef.current.values()) {
                    source.stop();
                }
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
        },
        onerror: (e: ErrorEvent) => {
          console.error('Session error:', e);
          setError('A connection error occurred with the AI service.');
          setSessionState(LectureSessionState.ERROR);
          disconnect();
        },
        onclose: (e: CloseEvent) => {
          disconnect();
        },
      }
    });

    sessionPromiseRef.current = sessionPromise;
  }, [slides, disconnect, setTranscript, sendTextMessage, selectedLanguage, selectedVoice, selectedModel, onSlideChange]);

  const replay = useCallback(() => sendTextMessage("Please repeat your explanation for the current slide."), [sendTextMessage]);
  const next = useCallback(() => sendTextMessage("Go to the next slide."), [sendTextMessage]);
  const previous = useCallback(() => sendTextMessage("Go back to the previous slide."), [sendTextMessage]);
  const goToSlide = useCallback((slideNumber: number) => sendTextMessage(`Please jump to slide number ${slideNumber}.`), [sendTextMessage]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // FIX: Export `disconnect` function as `end`.
  return { sessionState, startLecture, replay, next, previous, end: disconnect, error, goToSlide, sendTextMessage };
};