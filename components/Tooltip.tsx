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
        className="hidden md:block absolute right-full top-1/2 -translate-y-1/2 mr-2 w-max max-w-xs px-3 py-1.5 text-sm font-medium text-white bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[100]"
        role="tooltip"
      >
        {content}
        <div className="absolute left-full top-1/2 -translate-y-1/2 -translate-x-0 w-0 h-0 border-y-4 border-y-transparent border-l-4 border-l-gray-900/90"></div>
      </div>
    </span>
  );
};

export default Tooltip;
