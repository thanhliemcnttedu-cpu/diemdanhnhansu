export interface HeadTiltQuestion {
  id: string;
  question: string;
  image?: string;
  optionA: string; // Nghiêng trái (Left)
  optionB: string; // Nghiêng phải (Right)
  correctAnswer: 'A' | 'B';
  explanation?: string;
}

export interface HeadTiltQuizConfig {
  id: string;
  title: string;
  description?: string;
  isTrial?: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  useCamera: boolean;
  useAiVoice: boolean;
  tiltSensitivity: number; // Góc nghiêng (độ), mặc định 20
  autoNextDelay: number; // Thời gian tự động chuyển câu (giây), mặc định 3
  bgMusicEnabled: boolean;
  bgMusicPreset: string;
  customMusicUrl?: string;
  questions: HeadTiltQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface HeadTiltAnswerRecord {
  questionId: string;
  questionText: string;
  selectedAnswer: 'A' | 'B' | null;
  selectedText: string;
  correctAnswer: 'A' | 'B';
  correctText: string;
  isCorrect: boolean;
}

export interface HeadTiltQuizResult {
  quizTitle: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  records: HeadTiltAnswerRecord[];
  completedAt: string;
}

export const HEAD_TILT_STORAGE_KEY = 'lhhp_head_tilt_quizzes_v1';

export const DEFAULT_TRIAL_QUIZ: HeadTiltQuizConfig = {
  id: 'trial-quiz-1',
  title: 'Quiz Nghiêng Đầu - Bản Chạy Thử',
  description: 'Chơi thử để trải nghiệm tính năng nhận diện camera trước khi tạo bài của bạn',
  isTrial: true,
  shuffleQuestions: false,
  shuffleOptions: false,
  useCamera: true,
  useAiVoice: false,
  tiltSensitivity: 20,
  autoNextDelay: 3,
  bgMusicEnabled: true,
  bgMusicPreset: 'default_fun',
  questions: [
    {
      id: 'ht-q1',
      question: 'Thủ đô của Nhật Bản là thành phố nào?',
      optionA: 'Tokyo',
      optionB: 'Osaka',
      correctAnswer: 'A',
      explanation: 'Tokyo là thủ đô và thành phố đông dân nhất của Nhật Bản.'
    },
    {
      id: 'ht-q2',
      question: 'Hành tinh nào lớn nhất trong Hệ Mặt Trời?',
      optionA: 'Sao Thổ',
      optionB: 'Sao Mộc',
      correctAnswer: 'B',
      explanation: 'Sao Mộc (Jupiter) là hành tinh có khối lượng và thể tích lớn nhất trong Hệ Mặt Trời.'
    },
    {
      id: 'ht-q3',
      question: 'Kết quả của 3² + 4² là bao nhiêu?',
      optionA: '14',
      optionB: '25',
      correctAnswer: 'B',
      explanation: '3² = 9, 4² = 16. Tổng 9 + 16 = 25.'
    },
    {
      id: 'ht-q4',
      question: '1/2 + 1/4 bằng bao nhiêu?',
      optionA: '2/6',
      optionB: '3/4',
      correctAnswer: 'B',
      explanation: '1/2 quy đồng là 2/4. 2/4 + 1/4 = 3/4.'
    },
    {
      id: 'ht-q5',
      question: 'Đất nước nào được mệnh danh là Xứ sở Mặt trời mọc?',
      optionA: 'Hàn Quốc',
      optionB: 'Nhật Bản',
      correctAnswer: 'B',
      explanation: 'Nhật Bản trong tiếng Hán Việt có nghĩa là "gốc của Mặt Trời" hay "Xứ sở Mặt trời mọc".'
    },
    {
      id: 'ht-q6',
      question: 'Hình nào có 3 cạnh và 3 góc?',
      optionA: 'Hình tam giác',
      optionB: 'Hình chữ nhật',
      correctAnswer: 'A',
      explanation: 'Hình tam giác là hình học phẳng có đúng 3 cạnh và 3 góc.'
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};
