import React from "react";
import { Slide } from "../../types";

interface SlidesThumbStripProps {
  slides: Slide[];
  currentIndex: number;
  onSelect: (index: number) => void;
  itemClassName?: string;
  imageClassName?: string;
}

const SlidesThumbStrip: React.FC<SlidesThumbStripProps> = ({
  slides,
  currentIndex,
  onSelect,
  itemClassName,
  imageClassName,
}) => {
  return (
    <>
      {slides.map((slide, index) => (
        <div
          key={slide.pageNumber}
          onClick={() => onSelect(index)}
          className={`cursor-pointer border-2 transition-all rounded-md overflow-hidden ${
            index === currentIndex ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-500'
          } ${itemClassName || ''}`}
        >
          <img
            src={slide.imageDataUrl}
            alt={`Slide ${slide.pageNumber}`}
            className={imageClassName || 'w-full h-auto'}
          />
        </div>
      ))}
    </>
  );
};

export default SlidesThumbStrip;


