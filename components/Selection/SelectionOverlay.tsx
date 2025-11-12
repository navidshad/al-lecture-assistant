import React from "react";
import { Bounds } from "../../utils/imageUtils";
import { Plus, X } from "lucide-react";

interface SelectionOverlayProps {
  bounds: Bounds;
  onAdd: () => void;
  onRemove: () => void;
}

/**
 * Pure presentational component for selection rectangle overlay
 * Displays rectangle and [Add, Remove] buttons
 */
const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  bounds,
  onAdd,
  onRemove,
}) => {
  return (
    <div
      className="absolute pointer-events-none z-30"
      style={{
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }}
    >
      {/* Selection rectangle */}
      <div className="absolute inset-0 border-2 border-blue-500 bg-blue-500/20" />

      {/* Buttons container - positioned below the rectangle */}
      <div
        className="absolute pointer-events-auto flex gap-2"
        style={{
          top: `${bounds.height + 8}px`,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors shadow-lg"
          aria-label="Attach to chat"
        >
          <Plus className="w-4 h-4" />
          <span>Attach</span>
        </button>
        <button
          onClick={onRemove}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors shadow-lg"
          aria-label="Remove selection"
        >
          <X className="w-4 h-4" />
          <span>Remove</span>
        </button>
      </div>
    </div>
  );
};

export default SelectionOverlay;
