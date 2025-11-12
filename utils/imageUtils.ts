/**
 * Image manipulation utilities
 * Pure functions for image cropping and element capture
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crops an image from a data URL using the specified bounds
 * @param dataUrl - Base64 data URL of the image
 * @param bounds - Selection bounds relative to container
 * @param containerWidth - Width of the container element
 * @param containerHeight - Height of the container element
 * @returns Promise resolving to cropped image as data URL
 */
export async function cropImage(
  dataUrl: string,
  bounds: Bounds,
  containerWidth: number,
  containerHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate the actual image dimensions and scale
      const imgAspect = img.width / img.height;
      const containerAspect = containerWidth / containerHeight;
      
      let displayedWidth: number;
      let displayedHeight: number;
      let offsetX = 0;
      let offsetY = 0;
      
      // Calculate displayed image size (object-contain behavior)
      if (imgAspect > containerAspect) {
        // Image is wider - fit to width
        displayedWidth = containerWidth;
        displayedHeight = containerWidth / imgAspect;
        offsetY = (containerHeight - displayedHeight) / 2;
      } else {
        // Image is taller - fit to height
        displayedHeight = containerHeight;
        displayedWidth = containerHeight * imgAspect;
        offsetX = (containerWidth - displayedWidth) / 2;
      }
      
      // Calculate scale factor from displayed size to actual image size
      const scaleX = img.width / displayedWidth;
      const scaleY = img.height / displayedHeight;
      
      // Adjust bounds to account for image offset
      const adjustedX = Math.max(0, bounds.x - offsetX);
      const adjustedY = Math.max(0, bounds.y - offsetY);
      const adjustedWidth = Math.min(displayedWidth - adjustedX, bounds.width);
      const adjustedHeight = Math.min(displayedHeight - adjustedY, bounds.height);
      
      // Convert to actual image coordinates
      const cropX = adjustedX * scaleX;
      const cropY = adjustedY * scaleY;
      const cropWidth = adjustedWidth * scaleX;
      const cropHeight = adjustedHeight * scaleY;
      
      // Create canvas and crop
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = dataUrl;
  });
}

/**
 * Captures a DOM element as an image
 * @param element - HTML element to capture
 * @returns Promise resolving to captured image as data URL
 */
export async function captureElementAsImage(element: HTMLElement): Promise<string> {
  // Dynamic import to avoid bundling html2canvas if not needed
  const html2canvas = (await import('html2canvas')).default;
  
  const canvas = await html2canvas(element, {
    backgroundColor: null,
    scale: 1,
    useCORS: true,
    logging: false,
  });
  
  return canvas.toDataURL('image/png');
}

