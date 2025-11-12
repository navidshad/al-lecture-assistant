import React from 'react';
import { ChatAttachment } from '../../types';

interface MessageAttachmentsProps {
  attachments: ChatAttachment[];
  isDesktop?: boolean;
}

/**
 * Component to display attachments in transcript messages
 * Shows image previews and file names
 */
const MessageAttachments: React.FC<MessageAttachmentsProps> = ({
  attachments,
  isDesktop = false,
}) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${isDesktop ? '' : 'gap-1.5'}`}>
      {attachments.map((attachment) => {
        const isImage = attachment.type === 'image' || attachment.type === 'selection';

        if (isImage) {
          return (
            <div
              key={attachment.id}
              className={`relative rounded-lg overflow-hidden border border-gray-600 bg-gray-800 ${
                isDesktop ? 'max-w-[200px] max-h-[150px]' : 'max-w-[120px] max-h-[90px]'
              }`}
            >
              <img
                src={attachment.data}
                alt={attachment.fileName || 'Attachment'}
                className="w-full h-full object-cover"
              />
            </div>
          );
        }
        // Only images are supported, so this shouldn't happen
        return null;
      })}
    </div>
  );
};

export default MessageAttachments;

