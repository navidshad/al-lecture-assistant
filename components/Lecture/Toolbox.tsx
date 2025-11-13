import React from 'react';
import { Square } from 'lucide-react';
import Tooltip from '../Tooltip';

interface ToolboxProps {
  isRectangleToolActive: boolean;
  onRectangleToolToggle: () => void;
  onToolActivate?: () => void; // General callback when any tool is activated
}

/**
 * Toolbar component with tool buttons
 * Extensible for adding more tools in the future
 * Hidden on mobile devices
 */
const Toolbox: React.FC<ToolboxProps> = ({
  isRectangleToolActive,
  onRectangleToolToggle,
  onToolActivate,
}) => {
  const handleRectangleToolClick = () => {
    // If tool is being activated (was inactive, now will be active), call onToolActivate
    if (!isRectangleToolActive && onToolActivate) {
      onToolActivate();
    }
    onRectangleToolToggle();
  };

  return (
    <div className="hidden md:flex items-center gap-2 p-1.5">
      <Tooltip content="Select and capture portions of slides or canvas content to attach to your messages">
        <span className="text-xs font-medium text-gray-400 px-1.5 cursor-help">Draw Tools</span>
      </Tooltip>
      <Tooltip content="Rectangle selection tool - Click to enable, then drag on slide or canvas to select an area">
        <button
          onClick={handleRectangleToolClick}
          className={`flex items-center justify-center p-1.5 rounded transition-colors ${
            isRectangleToolActive
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          aria-label="Toggle rectangle selection tool"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </Tooltip>
      {/* Future tools can be added here */}
    </div>
  );
};

export default Toolbox;

