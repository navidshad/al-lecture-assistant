export interface ParsedSlide {
  pageNumber: number;
  imageDataUrl: string;
  textContent: string;
}

export interface Slide extends ParsedSlide {
  summary: string;
  canvasContent?: CanvasBlock[];
}

export interface LectureConfig {
  language: string;
  voice: string;
  model: string;
}

export interface LectureSession {
  id: string;
  fileName: string;
  createdAt: number;
  slides: Slide[];
  generalInfo: string;
  transcript: TranscriptEntry[];
  currentSlideIndex: number;
  lectureConfig: LectureConfig;
}


export enum LectureSessionState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  READY = 'READY',
  LECTURING = 'LECTURING',
  LISTENING = 'LISTENING',
  ENDED = 'ENDED',
  ERROR = 'ERROR',
  DISCONNECTED = 'DISCONNECTED',
}

export interface TranscriptEntry {
  speaker: 'user' | 'ai';
  text: string;
  slideNumber?: number;
}

export type CanvasBlockType = 'markdown' | 'diagram' | 'ascii' | 'table';

export interface CanvasBlock {
  type: CanvasBlockType;
  content: string;
}