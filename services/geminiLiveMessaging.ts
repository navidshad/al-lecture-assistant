import { Slide, ChatAttachment } from "../types";
import { logger } from "./logger";

const LOG_SOURCE = "geminiLiveMessaging";

export type SendMessageOptions = {
  slide?: Slide;
  text?: string | string[];
  attachments?: ChatAttachment[];
  turnComplete?: boolean;
};

interface MessagingDependencies {
  sessionOpenRef: { current: boolean };
  runWithOpenSession: (runner: (session: any) => void) => void;
}

/**
 * Creates a sendMessage function for Gemini Live session
 */
export const createSendMessage = ({
  sessionOpenRef,
  runWithOpenSession,
}: MessagingDependencies) => {
  const sendMessage = (options: SendMessageOptions) => {
    logger.debug(LOG_SOURCE, "sendMessage called.");
    if (!sessionOpenRef.current) {
      logger.warn(
        LOG_SOURCE,
        "Attempted to send but session is not open. Ignoring."
      );
      return;
    }
    const { slide, text, attachments } = options;
    const turnComplete = options.turnComplete ?? true;
    const parts: any[] = [];
    if (slide) {
      const base64Data = slide.imageDataUrl.split(",")[1];
      if (base64Data) {
        parts.push({
          inlineData: { mimeType: "image/png", data: base64Data },
        });
      }
      if (slide.canvasContent && slide.canvasContent.length > 0) {
        parts.push({
          text: `Context: The canvas for this slide currently contains the following content blocks, which you or the user created earlier. Use this information in your explanation. Canvas Content: ${JSON.stringify(
            slide.canvasContent
          )}`,
        });
      }
    }

    // Process attachments (only images are supported)
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.type === "image" || attachment.type === "selection") {
          // Image attachments (including selections)
          const base64Data = attachment.data.split(",")[1];
          if (base64Data) {
            parts.push({
              inlineData: {
                mimeType: attachment.mimeType || "image/png",
                data: base64Data,
              },
            });
          }
        }
        // Only images are supported, ignore other types
      }
    }

    if (typeof text === "string") {
      parts.push({ text });
    } else if (Array.isArray(text)) {
      for (const t of text) {
        parts.push({ text: t });
      }
    }
    if (parts.length === 0) {
      logger.warn(
        LOG_SOURCE,
        "sendMessage called with no parts to send. Ignoring."
      );
      return;
    }
    runWithOpenSession((session) => {
      try {
        session.sendClientContent?.({
          turns: [{ role: "user", parts }],
          turnComplete,
        });
      } catch (e) {
        logger.warn(
          LOG_SOURCE,
          "sendClientContent failed in sendMessage; falling back to realtime inputs.",
          e as any
        );
        try {
          for (const p of parts) {
            if (p.inlineData) {
              session.sendRealtimeInput({
                media: {
                  data: p.inlineData.data,
                  mimeType: p.inlineData.mimeType,
                },
              });
            } else if (typeof p.text === "string") {
              session.sendRealtimeInput({ text: p.text });
            }
          }
          if (turnComplete) {
            session.sendRealtimeInput?.({ event: "end_of_turn" });
          }
        } catch {}
      }
    });
  };

  return sendMessage;
};

