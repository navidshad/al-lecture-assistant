import React, { useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { validateFileType, validateFileSize } from '../../utils/fileUtils';
import { useToast } from '../../hooks/useToast';

interface FileUploadButtonProps {
  onFileSelect: (file: File) => void;
  maxSizeMB: number;
  label: string;
  isDesktop?: boolean;
}

/**
 * Image upload button component
 * Handles click and file selection with validation (images only)
 */
const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  onFileSelect,
  maxSizeMB,
  label,
  isDesktop = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (only images)
    const typeValidation = validateFileType(file);
    if (!typeValidation.valid) {
      showToast(typeValidation.error || 'Invalid file type. Please upload an image.', 'error');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Validate file size
    if (!validateFileSize(file, maxSizeMB)) {
      showToast(`File size exceeds ${maxSizeMB}MB limit`, 'error');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    onFileSelect(file);
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-label={label}
      />
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors ${
          isDesktop ? 'text-sm' : 'text-xs'
        }`}
        title={label}
        aria-label={label}
      >
        <ImageIcon className={isDesktop ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        <span className="hidden sm:inline">{label}</span>
      </button>
    </>
  );
};

export default FileUploadButton;

