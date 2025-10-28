import React from 'react';
import LectureView from '../components/LectureView';
import { Slide } from '../types';

interface LecturePageProps {
  slides: Slide[];
  selectedLanguage: string;
  selectedVoice: string;
  selectedModel: string;
  onEndSession: () => void;
}

const LecturePage: React.FC<LecturePageProps> = ({ 
  slides, 
  selectedLanguage, 
  selectedVoice, 
  selectedModel, 
  onEndSession 
}) => {
  return (
    <LectureView 
      slides={slides} 
      onEndSession={onEndSession} 
      selectedLanguage={selectedLanguage} 
      selectedVoice={selectedVoice} 
      selectedModel={selectedModel} 
    />
  );
};

export default LecturePage;
