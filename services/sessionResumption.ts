import { logger } from "./logger";

const LOG_SOURCE = "sessionResumption";
const STORAGE_PREFIX = "gemini-live-resumption-";
const EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredHandle {
  handle: string;
  timestamp: number;
}

/**
 * Get storage key for a session
 */
const getStorageKey = (sessionId?: string): string => {
  return sessionId ? `${STORAGE_PREFIX}${sessionId}` : `${STORAGE_PREFIX}default`;
};

/**
 * Store resumption handle for a session
 */
export const storeResumptionHandle = (
  handle: string,
  sessionId?: string
): void => {
  try {
    const key = getStorageKey(sessionId);
    const data: StoredHandle = {
      handle,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
    logger.debug(
      LOG_SOURCE,
      `Stored resumption handle for session ${sessionId || "default"}`
    );
  } catch (error) {
    logger.warn(LOG_SOURCE, "Failed to store resumption handle", error);
  }
};

/**
 * Retrieve resumption handle for a session
 * Returns null if handle doesn't exist or has expired (2 hours)
 */
export const getResumptionHandle = (sessionId?: string): string | null => {
  try {
    const key = getStorageKey(sessionId);
    const stored = localStorage.getItem(key);
    if (!stored) {
      return null;
    }

    const data: StoredHandle = JSON.parse(stored);
    const age = Date.now() - data.timestamp;

    // Check if handle has expired (2 hours)
    if (age > EXPIRATION_MS) {
      logger.debug(
        LOG_SOURCE,
        `Resumption handle expired (age: ${age}ms) for session ${sessionId || "default"}`
      );
      localStorage.removeItem(key);
      return null;
    }

    logger.debug(
      LOG_SOURCE,
      `Retrieved resumption handle for session ${sessionId || "default"} (age: ${age}ms)`
    );
    return data.handle;
  } catch (error) {
    logger.warn(LOG_SOURCE, "Failed to retrieve resumption handle", error);
    return null;
  }
};

/**
 * Clear resumption handle for a session
 * Only call this when user explicitly ends the session
 */
export const clearResumptionHandle = (sessionId?: string): void => {
  try {
    const key = getStorageKey(sessionId);
    localStorage.removeItem(key);
    logger.debug(
      LOG_SOURCE,
      `Cleared resumption handle for session ${sessionId || "default"}`
    );
  } catch (error) {
    logger.warn(LOG_SOURCE, "Failed to clear resumption handle", error);
  }
};

