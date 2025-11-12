/**
 * File validation and conversion utilities
 * Pure utility functions for file handling
 */

export interface FileValidationResult {
  valid: boolean;
  type: 'image' | null;
  error?: string;
}

/**
 * Validates file size
 * @param file - File to validate
 * @param maxSizeMB - Maximum size in megabytes
 * @returns true if file size is within limit
 */
export function validateFileSize(file: File, maxSizeMB: number): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

/**
 * Validates file type
 * @param file - File to validate
 * @returns Validation result with file type
 */
export function validateFileType(file: File): FileValidationResult {
  const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (validImageTypes.includes(file.type)) {
    return { valid: true, type: 'image' };
  }
  
  return {
    valid: false,
    type: null,
    error: 'Invalid file type. Please upload an image (JPEG, PNG, GIF, WebP).',
  };
}

/**
 * Converts a file to base64 data URL
 * @param file - File to convert
 * @returns Promise resolving to base64 data URL
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Gets MIME type from file
 * @param file - File to get MIME type from
 * @returns MIME type string
 */
export function getFileMimeType(file: File): string {
  return file.type || 'application/octet-stream';
}

