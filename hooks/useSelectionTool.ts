import { useState, useCallback, useRef } from 'react';
import { Bounds } from '../utils/imageUtils';

export interface UseSelectionToolReturn {
  isDrawing: boolean;
  selectionBounds: Bounds | null;
  startDrawing: (x: number, y: number) => void;
  updateDrawing: (x: number, y: number) => void;
  finishDrawing: () => void;
  clearSelection: () => void;
}

/**
 * Hook for managing rectangle selection tool state
 * Handles drawing state and calculates selection bounds
 */
export function useSelectionTool(): UseSelectionToolReturn {
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const startDrawing = useCallback((x: number, y: number) => {
    setIsDrawing(true);
    startPointRef.current = { x, y };
    setSelectionBounds({ x, y, width: 0, height: 0 });
  }, []);

  const updateDrawing = useCallback((x: number, y: number) => {
    if (!startPointRef.current || !isDrawing) return;

    const startX = startPointRef.current.x;
    const startY = startPointRef.current.y;

    const bounds: Bounds = {
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY),
    };

    setSelectionBounds(bounds);
  }, [isDrawing]);

  const finishDrawing = useCallback(() => {
    setIsDrawing(false);
    startPointRef.current = null;
    // Keep selectionBounds for display until cleared
  }, []);

  const clearSelection = useCallback(() => {
    setIsDrawing(false);
    startPointRef.current = null;
    setSelectionBounds(null);
  }, []);

  return {
    isDrawing,
    selectionBounds,
    startDrawing,
    updateDrawing,
    finishDrawing,
    clearSelection,
  };
}

