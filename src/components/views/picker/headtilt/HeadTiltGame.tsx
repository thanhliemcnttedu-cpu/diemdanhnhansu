import React, { useState } from 'react';
import { HeadTiltQuizConfig, DEFAULT_TRIAL_QUIZ, loadHeadTiltQuizzes, saveHeadTiltQuizzes } from './types';
import { useClassroom } from '../../../../context/ClassroomContext';
import { HeadTiltQuizManageView } from './HeadTiltQuizManageView';
import { HeadTiltQuizEditorView } from './HeadTiltQuizEditorView';
import { HeadTiltGamePlayView } from './HeadTiltGamePlayView';

interface HeadTiltGameProps {
  onBackToDashboard: () => void;
}

export const HeadTiltGame: React.FC<HeadTiltGameProps> = ({ onBackToDashboard }) => {
  const { currentUser } = useClassroom();
  // Current view within Head Tilt Game: 'manage' | 'editor' | 'play'
  const [currentSubView, setCurrentSubView] = useState<'manage' | 'editor' | 'play'>('manage');
  
  // Selected quiz for play or edit
  const [selectedQuiz, setSelectedQuiz] = useState<HeadTiltQuizConfig>(DEFAULT_TRIAL_QUIZ);
  const [editingQuiz, setEditingQuiz] = useState<HeadTiltQuizConfig | null>(null);

  // Play Quiz
  const handlePlayQuiz = (quiz: HeadTiltQuizConfig) => {
    setSelectedQuiz(quiz);
    setCurrentSubView('play');
  };

  // Create new quiz
  const handleCreateNewQuiz = () => {
    setEditingQuiz(null);
    setCurrentSubView('editor');
  };

  // Edit existing quiz
  const handleEditQuiz = (quiz: HeadTiltQuizConfig) => {
    setEditingQuiz(quiz);
    setCurrentSubView('editor');
  };

  // Save quiz from editor
  const handleSaveQuiz = (savedConfig: HeadTiltQuizConfig) => {
    try {
      let list: HeadTiltQuizConfig[] = loadHeadTiltQuizzes(currentUser?.username) || [DEFAULT_TRIAL_QUIZ];
      
      const existsIndex = list.findIndex(q => q.id === savedConfig.id);
      if (existsIndex >= 0) {
        list[existsIndex] = savedConfig;
      } else {
        list = [savedConfig, ...list];
      }

      saveHeadTiltQuizzes(currentUser?.username, list);
    } catch (e) {
      console.warn('Error saving quiz to storage', e);
    }

    setCurrentSubView('manage');
  };

  return (
    <div className="w-full h-full min-h-[600px]">
      {currentSubView === 'manage' && (
        <HeadTiltQuizManageView
          onPlayQuiz={handlePlayQuiz}
          onCreateNewQuiz={handleCreateNewQuiz}
          onEditQuiz={handleEditQuiz}
          onBackToDashboard={onBackToDashboard}
        />
      )}

      {currentSubView === 'editor' && (
        <HeadTiltQuizEditorView
          initialConfig={editingQuiz}
          onSave={handleSaveQuiz}
          onCancel={() => setCurrentSubView('manage')}
        />
      )}

      {currentSubView === 'play' && (
        <HeadTiltGamePlayView
          quiz={selectedQuiz}
          onExit={() => setCurrentSubView('manage')}
        />
      )}
    </div>
  );
};
