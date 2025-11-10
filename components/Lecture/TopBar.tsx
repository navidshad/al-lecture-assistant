import React from "react";

const TopBar: React.FC<{ fileName: string; currentSlide: number; totalSlides: number; }> = ({ fileName, currentSlide, totalSlides }) => {
  return (
    <header className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex items-center justify-between z-20">
      <h1 className="text-xl font-bold truncate pr-4" title={fileName}>{fileName}</h1>
      <div className="text-sm text-gray-400 flex-shrink-0">
        Slide {currentSlide} of {totalSlides}
      </div>
    </header>
  );
};

export default TopBar;


