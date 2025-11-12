import React from 'react';
import { ChatAttachment } from '../../types';
import { X } from 'lucide-react';

interface AttachmentPreviewProps {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
  isDesktop?: boolean;
}

/**
 * Pure presentational component for single attachment preview
 * Displays thumbnail for images
 */
const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  onRemove,
  isDesktop = false,
}) => {
  const isImage = attachment.type === 'image' || attachment.type === 'selection';

  return (
    <div
      className={`relative flex-shrink-0 rounded-lg overflow-hidden border border-gray-600 bg-gray-700 ${
        isDesktop ? 'w-20 h-20' : 'w-16 h-16'
      }`}
    >
      {isImage ? (
        <img
          src={attachment.data}
          alt={attachment.fileName || 'Attachment'}
          className="w-full h-full object-cover"
        />
      ) : null}
      
      {/* Remove button */}
      <button
        onClick={() => onRemove(attachment.id)}
        className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
        aria-label="Remove attachment"
      >
        <X className={`${isDesktop ? 'w-3 h-3' : 'w-2.5 h-2.5'}`} />
      </button>
    </div>
  );
};

export default AttachmentPreview;

