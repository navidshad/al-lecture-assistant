export interface ParsedSlide {
  pageNumber: number;
  imageDataUrl: string;
  textContent: string;
}

export interface Slide extends ParsedSlide {
  summary: string;
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
}

export type CanvasBlockType = 'markdown' | 'diagram' | 'ascii' | 'table';

export interface CanvasBlock {
  type: CanvasBlockType;
  content: string;
}
