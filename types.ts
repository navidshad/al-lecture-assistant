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
}

export interface TranscriptEntry {
  speaker: 'user' | 'ai';
  text: string;
}