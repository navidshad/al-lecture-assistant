import { useCallback, useEffect } from "react";
import { LectureSession } from "../types";
import { sessionManager } from "../services/db";
import { logger } from "../services/logger";

const LOG_SOURCE = "useSessionPersistence";

export function useSessionPersistence(params: {
  session: LectureSession;
  slides: LectureSession["slides"];
  transcript: LectureSession["transcript"];
  currentSlideIndex: number;
}) {
  const { session, slides, transcript, currentSlideIndex } = params;

  const saveSessionState = useCallback(async () => {
    logger.debug(LOG_SOURCE, "Saving session state to DB.");
    const updatedSession: LectureSession = {
      ...session,
      slides,
      transcript,
      currentSlideIndex,
    };
    try {
      await sessionManager.updateSession(updatedSession);
    } catch (e) {
      logger.error(LOG_SOURCE, "Failed to save session state", e);
    }
  }, [session, slides, transcript, currentSlideIndex]);

  useEffect(() => {
    const debounceTimeout = setTimeout(saveSessionState, 2000);
    return () => clearTimeout(debounceTimeout);
  }, [saveSessionState]);

  return { saveSessionState };
}
