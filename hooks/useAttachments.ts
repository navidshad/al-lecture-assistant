import { useState, useCallback } from 'react';
import { ChatAttachment } from '../types';
import { createAttachmentFromFile, createAttachmentFromSelection } from '../utils/attachmentUtils';

export interface UseAttachmentsReturn {
  attachments: ChatAttachment[];
  addAttachment: (attachment: ChatAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  addFile: (file: File) => Promise<void>;
  addSelection: (imageDataUrl: string, mimeType?: string) => void;
}

/**
 * Hook for managing attachments state
 * Handles adding, removing, and creating attachments
 */
export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  const addAttachment = useCallback((attachment: ChatAttachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const addFile = useCallback(async (file: File) => {
    const attachment = await createAttachmentFromFile(file);
    addAttachment(attachment);
  }, [addAttachment]);

  const addSelection = useCallback(
    (imageDataUrl: string, mimeType: string = 'image/png') => {
      const attachment = createAttachmentFromSelection(imageDataUrl, mimeType);
      addAttachment(attachment);
    },
    [addAttachment]
  );

  return {
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    addFile,
    addSelection,
  };
}

