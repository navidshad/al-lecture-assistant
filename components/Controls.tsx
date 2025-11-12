
import React from 'react';
import { Mic, MicOff, RotateCcw, ArrowLeft, ArrowRight, MessageSquare, Power, LayoutGrid, Download } from 'lucide-react';
import Tooltip from './Tooltip';

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
  onDownloadTranscript: () => void;
  isTranscriptEmpty: boolean;
  onEndSession: () => void;
}

const ControlButton: React.FC<{ onClick?: () => void; disabled?: boolean; children: React.ReactNode; className?: string; ariaLabel: string }> = ({ onClick, disabled, children, className, ariaLabel }) => (
    <button
        aria-label={ariaLabel}
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
  onDownloadTranscript,
  isTranscriptEmpty,
  onEndSession,
}) => {
  return (
    <div className="flex items-center justify-between gap-4">
       <div className="w-40 flex items-center gap-1">
         <Tooltip content="Toggle Transcript">
            <ControlButton onClick={onTranscriptToggle} className="bg-gray-700 text-gray-300" ariaLabel="Toggle Transcript">
                <MessageSquare className="h-6 w-6" />
            </ControlButton>
        </Tooltip>
         <Tooltip content="Toggle Slides">
            <ControlButton onClick={onSlidesToggle} className="bg-gray-700 text-gray-300" ariaLabel="Toggle Slides">
                <LayoutGrid className="h-6 w-6" />
            </ControlButton>
        </Tooltip>
         <Tooltip content="Download Transcript">
            <ControlButton onClick={onDownloadTranscript} disabled={isTranscriptEmpty} className="bg-gray-700 text-gray-300" ariaLabel="Download Transcript">
                <Download className="h-6 w-6" />
            </ControlButton>
        </Tooltip>
       </div>
        
        <div className="flex items-center gap-1">
            <Tooltip content="Previous Slide">
                <ControlButton onClick={onPrevious} disabled={isPreviousDisabled} className="bg-gray-700 text-gray-300" ariaLabel="Previous Slide">
                    <ArrowLeft className="h-6 w-6" />
                </ControlButton>
            </Tooltip>

            <Tooltip content={isMuted ? "Unmute Microphone" : "Mute Microphone"}>
                <ControlButton onClick={onMuteToggle} className={`${isMuted ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'} h-16 w-16`} ariaLabel={isMuted ? "Unmute Microphone" : "Mute Microphone"}>
                    {isMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
                </ControlButton>
            </Tooltip>

             <Tooltip content="Replay Explanation">
                <ControlButton onClick={onReplay} className="bg-gray-700 text-gray-300" ariaLabel="Replay Explanation">
                    <RotateCcw className="h-6 w-6" />
                </ControlButton>
            </Tooltip>

            <Tooltip content="Next Slide">
                <ControlButton onClick={onNext} disabled={isNextDisabled} className="bg-gray-700 text-gray-300" ariaLabel="Next Slide">
                    <ArrowRight className="h-6 w-6" />
                </ControlButton>
            </Tooltip>
        </div>
        
        <div className="w-40 flex justify-end">
            <Tooltip content="End Session">
                <ControlButton onClick={onEndSession} className="bg-red-800/80 text-red-300 hover:bg-red-700" ariaLabel="End Session">
                    <Power className="h-6 w-6" />
                </ControlButton>
            </Tooltip>
        </div>
    </div>
  );
};

export default React.memo(Controls);
