import { encode, decode, decodeAudioData } from "./audioUtils";
import { logger } from "./logger";
import { Blob as GenAI_Blob } from "@google/genai";
import { ENABLE_SERVER_INTERRUPT } from "./geminiLiveUtils";

const LOG_SOURCE = "geminiLiveAudio";

export interface AudioRefs {
  mediaStreamRef: React.MutableRefObject<MediaStream | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  scriptProcessorRef: React.MutableRefObject<ScriptProcessorNode | null>;
  mediaStreamSourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>;
  outputAudioContextRef: React.MutableRefObject<AudioContext | null>;
  nextStartTimeRef: React.MutableRefObject<number>;
  audioSourcesRef: React.MutableRefObject<Set<AudioBufferSourceNode>>;
  isMutedRef: React.MutableRefObject<boolean>;
  sessionOpenRef: React.MutableRefObject<boolean>;
  sessionPromiseRef: React.MutableRefObject<Promise<any> | null>;
  aiMessageOpenRef: React.MutableRefObject<boolean>;
}

export interface AudioDependencies {
  refs: AudioRefs;
  runWithOpenSession: (runner: (session: any) => void) => void;
}

/**
 * Initializes output audio context
 */
export const initializeOutputAudio = (
  outputAudioContextRef: React.MutableRefObject<AudioContext | null>
) => {
  outputAudioContextRef.current = new (window.AudioContext ||
    (window as any).webkitAudioContext)({ sampleRate: 24000 });
};

/**
 * Initializes input audio (microphone stream and processing)
 */
export const initializeInputAudio = async (
  refs: AudioRefs,
  runWithOpenSession: (runner: (session: any) => void) => void
): Promise<void> => {
  const {
    audioContextRef,
    mediaStreamRef,
    scriptProcessorRef,
    mediaStreamSourceRef,
    isMutedRef,
    sessionOpenRef,
  } = refs;

  // Create input audio context
  audioContextRef.current = new (window.AudioContext ||
    (window as any).webkitAudioContext)({ sampleRate: 16000 });

  // Get microphone stream
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  // Check if session was closed while awaiting getUserMedia
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

  // Create media stream source
  const source = ctx.createMediaStreamSource(stream);
  mediaStreamSourceRef.current = source;

  // Create script processor for audio processing
  const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);
  scriptProcessorRef.current = scriptProcessor;

  // Set up audio processing callback
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

  // Connect audio nodes (source -> processor -> gain -> destination)
  const gainNode = audioContextRef.current.createGain();
  gainNode.gain.value = 0; // Mute local playback
  source.connect(scriptProcessor);
  scriptProcessor.connect(gainNode);
  gainNode.connect(audioContextRef.current.destination);
};

/**
 * Cleans up all audio resources
 */
export const cleanupAudioResources = (refs: AudioRefs) => {
  logger.log(LOG_SOURCE, "Cleaning up audio resources.");
  const {
    mediaStreamRef,
    scriptProcessorRef,
    mediaStreamSourceRef,
    audioContextRef,
    outputAudioContextRef,
    audioSourcesRef,
    nextStartTimeRef,
    sessionPromiseRef,
  } = refs;

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
};

/**
 * Flushes the audio output queue and stops server-side generation
 */
export const flushAudioOutput = (
  refs: AudioRefs,
  runWithOpenSession: (runner: (session: any) => void) => void
) => {
  const {
    audioSourcesRef,
    nextStartTimeRef,
    aiMessageOpenRef,
    sessionOpenRef,
    sessionPromiseRef,
  } = refs;

  // Stop queued TTS locally
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
};

/**
 * Handles audio playback from server messages
 */
export const handleAudioPlayback = async (
  audioData: string,
  refs: AudioRefs
) => {
  const {
    outputAudioContextRef,
    nextStartTimeRef,
    audioSourcesRef,
  } = refs;

  if (!audioData || !outputAudioContextRef.current) {
    return;
  }

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
};

