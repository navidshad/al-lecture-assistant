import React, { useState, useEffect } from 'react';
import { LectureSession } from '../types';
import { sessionManager } from '../services/db';
import { BookOpen, Trash2, PlusCircle } from 'lucide-react';
import { logger } from '../services/logger';

const LOG_SOURCE = 'SessionsPage';

interface SessionsPageProps {
  onContinueSession: (session: LectureSession) => void;
  onNewSession: () => void;
}

const SessionsPage: React.FC<SessionsPageProps> = ({ onContinueSession, onNewSession }) => {
  const [sessions, setSessions] = useState<LectureSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = async () => {
    try {
      logger.log(LOG_SOURCE, 'Loading sessions from DB.');
      const savedSessions = await sessionManager.getAllSessions();
      setSessions(savedSessions);
    } catch (error) {
      logger.error(LOG_SOURCE, 'Failed to load sessions.', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleDelete = async (sessionId: string) => {
    if (window.confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      try {
        logger.log(LOG_SOURCE, `Deleting session ${sessionId}`);
        await sessionManager.deleteSession(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      } catch (error) {
        logger.error(LOG_SOURCE, `Failed to delete session ${sessionId}`, error);
      }
    }
  };
  
  const handleDeleteAll = async () => {
    if (sessions.length === 0) return;
    if (window.confirm('Delete ALL sessions? This action cannot be undone.')) {
      try {
        logger.log(LOG_SOURCE, 'Deleting ALL sessions');
        await sessionManager.clearAllSessions();
        setSessions([]);
      } catch (error) {
        logger.error(LOG_SOURCE, 'Failed to delete all sessions', error);
      }
    }
  };
  
  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-gray-200 p-4 md:p-8">
      <div className="w-full max-w-4xl">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white">Your Lecture Sessions</h1>
            <div className="flex items-center gap-2">
              {sessions.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                  title="Delete All Sessions"
                >
                  <Trash2 className="h-5 w-5" />
                  <span>Delete All</span>
                </button>
              )}
              <button
                onClick={onNewSession}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusCircle className="h-5 w-5" />
                <span>New Lecture</span>
              </button>
            </div>
        </div>
        
        {loading ? (
          <p className="text-center text-gray-400">Loading sessions...</p>
        ) : sessions.length > 0 ? (
          <div className="space-y-4">
            {sessions.map(session => (
              <div key={session.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-shadow hover:shadow-lg hover:shadow-blue-500/10">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white truncate" title={session.fileName}>{session.fileName}</h2>
                  <p className="text-sm text-gray-400">
                    Created: {new Date(session.createdAt).toLocaleString()} | {session.slides.length} slides
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                  <button
                    onClick={() => onContinueSession(session)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 transition-colors"
                    title="Continue Lecture"
                  >
                    <BookOpen className="h-5 w-5" />
                    <span>Continue</span>
                  </button>
                  <button
                    onClick={() => handleDelete(session.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                    title="Delete Session"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border-2 border-dashed border-gray-700 rounded-lg">
              <h2 className="text-2xl font-semibold text-gray-400">No Saved Sessions</h2>
              <p className="text-gray-500 mt-2">Start a new lecture from the main page to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionsPage;