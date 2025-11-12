import React, { useEffect, useRef, useState } from "react";
import { TranscriptEntry, LectureSessionState, ChatAttachment } from "../types";
import { User, Bot, Send, Copy, Check } from "lucide-react";
import AttachmentList from "./Chat/AttachmentList";
import FileUploadButton from "./Chat/FileUploadButton";
import MessageAttachments from "./Chat/MessageAttachments";
import MarkdownRenderer from "./MarkdownRenderer";
import { useToast } from "../hooks/useToast";

interface TranscriptPanelProps {
  isVisible: boolean;
  onClose: () => void;
  transcript: TranscriptEntry[];
  isDesktop?: boolean;
  onSendMessage: (message: string, attachments?: ChatAttachment[]) => void;
  sessionState: LectureSessionState;
  attachments: ChatAttachment[];
  onAddFile: (file: File) => Promise<void>;
  onAddSelection: (imageDataUrl: string) => void;
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  isVisible,
  onClose,
  transcript,
  isDesktop = false,
  onSendMessage,
  sessionState,
  attachments,
  onAddFile,
  onAddSelection,
  onRemoveAttachment,
  onClearAttachments,
}) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasContent = message.trim() || attachments.length > 0;
    if (hasContent) {
      onSendMessage(
        message.trim(),
        attachments.length > 0 ? attachments : undefined
      );
      setMessage("");
      onClearAttachments();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit(e as any);
    }
  };

  const handleImageFileSelect = async (file: File) => {
    await onAddFile(file);
  };

  const handleCopyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy message:", error);
      showToast("Failed to copy message to clipboard", "error");
    }
  };

  const isInputActive = [
    LectureSessionState.READY,
    LectureSessionState.LECTURING,
    LectureSessionState.LISTENING,
  ].includes(sessionState);

  const desktopClasses =
    "h-full bg-gray-800/50 border-r border-gray-700 transition-all duration-300 ease-in-out flex-shrink-0";
  const desktopVisibility = isVisible ? "w-96" : "w-0";

  // Removed border, background, and margin for mobile to make it frameless
  const mobileClasses = "transition-all duration-300 ease-in-out";
  const mobileVisibility = isVisible ? "h-64" : "h-0";

  return (
    <div
      className={`${
        isDesktop
          ? `${desktopClasses} ${desktopVisibility}`
          : `${mobileClasses} ${mobileVisibility}`
      } overflow-hidden`}
    >
      <div
        className={`flex flex-col h-full overflow-hidden ${
          isDesktop ? "w-96" : ""
        }`}
      >
        {isDesktop && (
          <header
            className={`flex items-center justify-between border-b border-gray-700 flex-shrink-0 p-4`}
          >
            <h2 className={`text-xl font-semibold`}>Lecture Transcript</h2>
          </header>
        )}
        <div className={`flex-1 overflow-y-auto ${isDesktop ? "p-4" : "p-2"}`}>
          <div className={`${isDesktop ? "space-y-6" : "space-y-3"}`}>
            {transcript.map((entry, index) => (
              <div
                key={index}
                className={`flex items-start ${isDesktop ? "gap-3" : "gap-2"}`}
              >
                <div
                  className={`flex-shrink-0 rounded-full flex items-center justify-center ${
                    isDesktop ? "h-8 w-8" : "h-6 w-6"
                  } ${
                    entry.speaker === "user" ? "bg-blue-600" : "bg-purple-600"
                  }`}
                >
                  {entry.speaker === "user" ? (
                    <User className={isDesktop ? "h-5 w-5" : "h-3 w-3"} />
                  ) : (
                    <Bot className={isDesktop ? "h-5 w-5" : "h-3 w-3"} />
                  )}
                </div>
                <div
                  className={`flex-1 bg-gray-700 rounded-lg relative group ${
                    isDesktop ? "p-3" : "p-2"
                  }`}
                >
                  {entry.text && (
                    <button
                      onClick={() => handleCopyMessage(entry.text, index)}
                      className={`absolute top-2 right-2 ${
                        isDesktop
                          ? "opacity-0 group-hover:opacity-100"
                          : "opacity-70"
                      } transition-opacity flex items-center justify-center rounded p-1.5 bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white ${
                        isDesktop ? "w-7 h-7" : "w-6 h-6"
                      }`}
                      title="Copy message"
                      aria-label="Copy message"
                    >
                      {copiedIndex === index ? (
                        <Check className={isDesktop ? "w-4 h-4" : "w-3 h-3"} />
                      ) : (
                        <Copy className={isDesktop ? "w-4 h-4" : "w-3 h-3"} />
                      )}
                    </button>
                  )}
                  {entry.speaker === "ai" && entry.slideNumber != null && (
                    <div className="mb-1">
                      <span
                        className={`${
                          isDesktop
                            ? "px-2 py-0.5 text-xs"
                            : "px-1.5 py-0.5 text-[10px]"
                        } inline-flex items-center rounded-md bg-gray-600 text-gray-200`}
                      >
                        Slide {entry.slideNumber}
                      </span>
                    </div>
                  )}
                  {entry.text && (
                    <div className={isDesktop ? "" : "text-xs"}>
                      <MarkdownRenderer markdown={entry.text} />
                    </div>
                  )}
                  {entry.attachments && entry.attachments.length > 0 && (
                    <MessageAttachments
                      attachments={entry.attachments}
                      isDesktop={isDesktop}
                    />
                  )}
                </div>
              </div>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
          {transcript.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p className={isDesktop ? "" : "text-sm"}>
                Transcript will appear here...
              </p>
            </div>
          )}
        </div>
        <div className={`${isDesktop ? "p-4" : "p-2 pt-0"} flex-shrink-0`}>
          {/* Attachment previews */}
          <AttachmentList
            attachments={attachments}
            onRemove={onRemoveAttachment}
            isDesktop={isDesktop}
          />

          {/* Input area */}
          <form
            onSubmit={handleFormSubmit}
            className="flex items-end gap-2 w-full"
          >
            <div className="flex-1 flex flex-col gap-2">
              {/* File upload buttons */}
              <div className="flex items-center gap-2">
                <FileUploadButton
                  onFileSelect={handleImageFileSelect}
                  maxSizeMB={2}
                  label="Image"
                  isDesktop={isDesktop}
                />
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isInputActive
                    ? "Ask a question... (Shift+Enter for new line)"
                    : "Session not active"
                }
                disabled={!isInputActive}
                rows={1}
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed resize-none overflow-hidden ${
                  isDesktop ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"
                }`}
                aria-label="Chat input"
              />
            </div>

            <button
              type="submit"
              disabled={
                !isInputActive || (!message.trim() && attachments.length === 0)
              }
              className={`flex-shrink-0 flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed ${
                isDesktop ? "h-10 w-10" : "h-8 w-8"
              }`}
              aria-label="Send message"
            >
              <Send className={isDesktop ? "h-5 w-5" : "h-3.5 w-3.5"} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TranscriptPanel;
