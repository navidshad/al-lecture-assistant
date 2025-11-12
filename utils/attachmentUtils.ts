/**
 * Attachment creation utilities
 * Business logic for creating ChatAttachment objects
 */

import { ChatAttachment } from '../types';
import { fileToBase64, getFileMimeType } from './fileUtils';

/**
 * Generates a unique ID for attachments
 * @returns Unique attachment ID
 */
export function generateAttachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates an attachment from a file upload
 * @param file - File to create attachment from
 * @returns Promise resolving to ChatAttachment
 */
export async function createAttachmentFromFile(file: File): Promise<ChatAttachment> {
  const data = await fileToBase64(file);
  const mimeType = getFileMimeType(file);
  // Only images are supported
  const type = 'image';
  
  return {
    id: generateAttachmentId(),
    type,
    data,
    mimeType,
    fileName: file.name,
  };
}

/**
 * Creates an attachment from a selection (cropped image)
 * @param imageDataUrl - Base64 data URL of the cropped image
 * @param mimeType - MIME type (defaults to 'image/png')
 * @returns ChatAttachment
 */
export function createAttachmentFromSelection(
  imageDataUrl: string,
  mimeType: string = 'image/png'
): ChatAttachment {
  return {
    id: generateAttachmentId(),
    type: 'selection',
    data: imageDataUrl,
    mimeType,
  };
}

