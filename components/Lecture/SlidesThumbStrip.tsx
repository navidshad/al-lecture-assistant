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
          className={`cursor-pointer border-2 transition-all rounded-md overflow-hidden relative ${
            index === currentIndex ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-500'
          } ${itemClassName || ''}`}
        >
          <img
            src={slide.imageDataUrl}
            alt={`Slide ${slide.pageNumber}`}
            className={imageClassName || 'w-full h-auto'}
          />
          <div className="absolute top-1 left-1">
            <span className="px-1.5 py-0.5 text-[10px] leading-none rounded bg-gray-900/80 text-gray-100">
              {slide.pageNumber}
            </span>
          </div>
        </div>
      ))}
    </>
  );
};

export default SlidesThumbStrip;


