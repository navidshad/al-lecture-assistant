import React from "react";
import { Slide } from "../../types";
import { Star } from "lucide-react";

interface SlidesThumbStripProps {
  slides: Slide[];
  currentIndex: number;
  onSelect: (index: number) => void;
  itemClassName?: string;
  imageClassName?: string;
  onHover?: (index: number | null) => void;
}

const SlidesThumbStrip: React.FC<SlidesThumbStripProps> = ({
  slides,
  currentIndex,
  onSelect,
  itemClassName,
  imageClassName,
  onHover,
}) => {
  return (
    <>
      {slides.map((slide, index) => (
        <div
          key={slide.pageNumber}
          onClick={index === currentIndex ? undefined : () => onSelect(index)}
          onMouseEnter={() => onHover && onHover(index === currentIndex ? null : index)}
          onMouseLeave={() => onHover && onHover(null)}
          className={`${index === currentIndex ? 'cursor-default' : 'cursor-pointer'} border-2 transition-all rounded-md overflow-hidden relative ${
            index === currentIndex
              ? 'border-blue-500 ring-2 ring-blue-400/60 shadow-xl shadow-blue-500/30 bg-blue-500/5'
              : 'border-transparent hover:border-gray-500'
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
          {slide.isImportant && (
            <div className="absolute top-1 right-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-yellow-500/90 text-gray-900">
                <Star className="w-3 h-3" />
              </span>
            </div>
          )}
        </div>
      ))}
    </>
  );
};

export default SlidesThumbStrip;


