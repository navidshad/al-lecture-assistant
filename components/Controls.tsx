
import React from 'react';
import { Mic, MicOff, RotateCcw, ArrowLeft, ArrowRight, MessageSquare, Power, LayoutGrid } from 'lucide-react';

interface ControlsProps {
  isMuted: boolean;
  onMuteToggle: () => void;
  onReplay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  isNextDisabled: boolean;
  isPreviousDisabled: boolean;
  onTranscriptToggle: () => void;
  onSlidesToggle: () => void;
  onEndSession: () => void;
}

const ControlButton: React.FC<{ onClick?: () => void; disabled?: boolean; children: React.ReactNode; className?: string; title: string }> = ({ onClick, disabled, children, className, title }) => (
    <button
        title={title}
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 ${className} ${disabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'hover:bg-gray-600'}`}
    >
        {children}
    </button>
);


const Controls: React.FC<ControlsProps> = ({
  isMuted,
  onMuteToggle,
  onReplay,
  onNext,
  onPrevious,
  isNextDisabled,
  isPreviousDisabled,
  onTranscriptToggle,
  onSlidesToggle,
  onEndSession,
}) => {
  return (
    <div className="flex items-center justify-between">
       <div className="w-28 flex items-center gap-2">
         <ControlButton onClick={onTranscriptToggle} className="bg-gray-700 text-gray-300" title="Toggle Transcript">
            <MessageSquare className="h-6 w-6" />
        </ControlButton>
         <ControlButton onClick={onSlidesToggle} className="bg-gray-700 text-gray-300" title="Toggle Slides">
            <LayoutGrid className="h-6 w-6" />
        </ControlButton>
       </div>
        
        <div className="flex items-center gap-4">
            <ControlButton onClick={onPrevious} disabled={isPreviousDisabled} className="bg-gray-700 text-gray-300" title="Previous Slide">
                <ArrowLeft className="h-6 w-6" />
            </ControlButton>

            <ControlButton onClick={onMuteToggle} className={`${isMuted ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'} h-16 w-16`} title={isMuted ? "Unmute Microphone" : "Mute Microphone"}>
                {isMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </ControlButton>

             <ControlButton onClick={onReplay} className="bg-gray-700 text-gray-300" title="Replay Explanation">
                <RotateCcw className="h-6 w-6" />
            </ControlButton>

            <ControlButton onClick={onNext} disabled={isNextDisabled} className="bg-gray-700 text-gray-300" title="Next Slide">
                <ArrowRight className="h-6 w-6" />
            </ControlButton>
        </div>
        
        <div className="w-28 flex justify-end">
            <ControlButton onClick={onEndSession} className="bg-red-800/80 text-red-300 hover:bg-red-700" title="End Session">
                <Power className="h-6 w-6" />
            </ControlButton>
        </div>
    </div>
  );
};

export default Controls;
