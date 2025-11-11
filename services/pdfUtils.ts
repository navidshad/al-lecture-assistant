import { ParsedSlide } from '../types';

// This is to inform TypeScript that pdfjsLib is available globally from the script tag in index.html
declare const pdfjsLib: any;

export const parsePdf = async (file: File): Promise<ParsedSlide[]> => {
  const fileReader = new FileReader();
  
  return new Promise((resolve, reject) => {
    fileReader.onload = async (event) => {
      if (!event.target?.result) {
        return reject(new Error("Failed to read file"));
      }

      const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
      
      try {
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const slides: ParsedSlide[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          // Adaptive scaling to improve small-text readability while bounding image size
          const baseViewport = page.getViewport({ scale: 1.0 });
          const IMAGE_MAX_SIDE_PX = 2200; // longest side target in px (cap bandwidth)
          const longestSide = Math.max(baseViewport.width, baseViewport.height);
          const scale = Math.min(3, Math.max(1.5, IMAGE_MAX_SIDE_PX / longestSide));
          const viewport = page.getViewport({ scale });
          
          // Create canvas to render page
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
              throw new Error("Could not get canvas context");
          }
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;
          const imageDataUrl = canvas.toDataURL('image/png');

          // Extract text content
          const textContentItems = await page.getTextContent();
          const textContent = textContentItems.items.map((item: any) => item.str).join(' ');

          slides.push({
            pageNumber: i,
            imageDataUrl,
            textContent,
          });
        }
        resolve(slides);
      } catch (error) {
        console.error("Error parsing PDF:", error);
        reject(error);
      }
    };

    fileReader.onerror = (error) => {
      reject(error);
    };

    fileReader.readAsArrayBuffer(file);
  });
};
