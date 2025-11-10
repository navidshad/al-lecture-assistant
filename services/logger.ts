// A simple logger utility to prefix messages and allow for easy disabling.
// Enable logs in dev, or when explicitly configured via Vite env define.
const DEBUG_MODE: boolean =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) ||
  false;

const getTimestamp = () => new Date().toISOString();

export const logger = {
  log: (source: string, message: string, ...data: any[]) => {
    if (DEBUG_MODE) {
      console.log(`${getTimestamp()} [LOG][${source}] ${message}`, ...data);
    }
  },
  debug: (source: string, message: string, ...data: any[]) => {
    if (DEBUG_MODE) {
      console.debug(`${getTimestamp()} [DEBUG][${source}] ${message}`, ...data);
    }
  },
  warn: (source: string, message: string, ...data: any[]) => {
    if (DEBUG_MODE) {
      console.warn(`${getTimestamp()} [WARN][${source}] ${message}`, ...data);
    }
  },
  error: (source: string, message: string, ...data: any[]) => {
    if (DEBUG_MODE) {
      console.error(`${getTimestamp()} [ERROR][${source}] ${message}`, ...data);
    }
  },
};
