import { GoogleGenAI } from '@google/genai';

export function getGenAI(apiKey: string | null) {
  return new GoogleGenAI({ apiKey: apiKey ?? (process.env.API_KEY as string) });
}


