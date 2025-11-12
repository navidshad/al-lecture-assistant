import React from 'react';
import { ChatAttachment } from '../../types';
import AttachmentPreview from './AttachmentPreview';

interface AttachmentListProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  isDesktop?: boolean;
}

/**
 * Renders list of AttachmentPreview components
 * Grid layout for attachments
 */
const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onRemove,
  isDesktop = false,
}) => {
  if (attachments.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${isDesktop ? 'mb-3' : 'mb-2'}`}>
      {attachments.map((attachment) => (
        <AttachmentPreview
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemove}
          isDesktop={isDesktop}
        />
      ))}
    </div>
  );
};

export default AttachmentList;

