import React, { useEffect, useRef } from 'react';
import { useSelectionTool } from '../../hooks/useSelectionTool';
import SelectionOverlay from './SelectionOverlay';

interface SelectionToolProps {
  isActive: boolean;
  containerRef: React.RefObject<HTMLElement>;
  onSelectionAdd: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onSelectionClear?: () => void;
  onDeactivate?: () => void;
}

/**
 * Container component for selection tool
 * Uses useSelectionTool hook and renders SelectionOverlay
 */
const SelectionTool: React.FC<SelectionToolProps> = ({
  isActive,
  containerRef,
  onSelectionAdd,
  onSelectionClear,
  onDeactivate,
}) => {
  const {
    isDrawing,
    selectionBounds,
    startDrawing,
    updateDrawing,
    finishDrawing,
    clearSelection,
  } = useSelectionTool();

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isActive || !containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    startDrawing(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isActive || !isDrawing || !containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    updateDrawing(x, y);
  };

  const handleMouseUp = () => {
    if (!isActive || !isDrawing) return;
    finishDrawing();
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isActive || !containerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    startDrawing(x, y);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isActive || !isDrawing || !containerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    updateDrawing(x, y);
  };

  const handleTouchEnd = () => {
    if (!isActive || !isDrawing) return;
    finishDrawing();
  };

  const handleAdd = () => {
    if (selectionBounds) {
      const bounds = selectionBounds; // Store bounds before clearing
      // Clear selection immediately to hide overlay
      clearSelection();
      if (onSelectionClear) {
        onSelectionClear();
      }
      // Deactivate draw mode immediately
      if (onDeactivate) {
        onDeactivate();
      }
      // Process selection after UI updates
      onSelectionAdd(bounds);
    }
  };

  const handleRemove = () => {
    clearSelection();
    if (onSelectionClear) {
      onSelectionClear();
    }
  };

  // Prevent text selection while drawing
  useEffect(() => {
    if (isDrawing) {
      document.body.style.userSelect = 'none';
      return () => {
        document.body.style.userSelect = '';
      };
    }
  }, [isDrawing]);

  if (!isActive) return null;

  return (
    <>
      {/* Event capture layer */}
      <div
        className="absolute inset-0 z-20 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ pointerEvents: isActive ? 'auto' : 'none' }}
      />
      
      {/* Selection overlay */}
      {selectionBounds && selectionBounds.width > 0 && selectionBounds.height > 0 && (
        <SelectionOverlay
          bounds={selectionBounds}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      )}
    </>
  );
};

export default SelectionTool;

