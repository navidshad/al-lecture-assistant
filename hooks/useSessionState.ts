import { useState, useCallback } from "react";
import { LectureSessionState } from "../types";
import { logger } from "../services/logger";

const LOG_SOURCE = "useSessionState";

/**
 * Hook for managing session state with logging
 */
export const useSessionState = () => {
  const [sessionState, _setSessionState] = useState<LectureSessionState>(
    LectureSessionState.IDLE
  );
  const [error, setError] = useState<string | null>(null);

  const setSessionState = useCallback((newState: LectureSessionState) => {
    _setSessionState((prevState) => {
      if (prevState !== newState) {
        logger.debug(
          LOG_SOURCE,
          `Session state changing from ${prevState} to ${newState}`
        );
      }
      return newState;
    });
  }, []);

  return {
    sessionState,
    setSessionState,
    error,
    setError,
  };
};

