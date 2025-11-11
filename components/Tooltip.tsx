import React from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  // Use a span for inline behavior to not break flexbox layouts
  return (
    <span className="relative group">
      {children}
      <div 
        className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-1.5 text-sm font-medium text-white bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10"
        role="tooltip"
      >
        {content}
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/90"></div>
      </div>
    </span>
  );
};

export default Tooltip;
