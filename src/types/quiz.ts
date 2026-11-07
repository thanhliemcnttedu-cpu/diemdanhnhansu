export type QuizQuestionType = 
  | 'single_choice'    // 4 đáp án có 1 đáp án đúng
  | 'multiple_choice'  // 4 đáp án có 2 đáp án đúng
  | 'true_false'       // Câu hỏi đúng sai
  | 'matching'         // Câu hỏi nối
  | 'essay';           // Câu hỏi tự luận

export type QuizDifficulty = 'DỄ' | 'TRUNG BÌNH' | 'KHÓ';

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  difficulty: QuizDifficulty;
  subject: string;
  grade: string;
  curriculum: string; // 'Kết nối tri thức với cuộc sống'
  topic: string;
  question: string;
  
  // Dạng 1 & 2: Trắc nghiệm 4 lựa chọn (1 hoặc 2 đáp án đúng)
  options?: string[];
  correctOptionIndices?: number[]; // [0] hoặc [0, 2]
  
  // Dạng 3: Đúng / Sai
  isTrue?: boolean;
  statement?: string;

  // Dạng 4: Nối cặp
  matchingPairs?: MatchingPair[];
  shuffledRightOptions?: string[]; // Danh sách các ý ở Cột B đã được xáo trộn không nối ngang

  // Dạng 5: Tự luận / Trả lời ngắn
  sampleAnswer?: string;
  scoringCriteria?: string;

  explanation: string;
  rewardCoins: number;
}

export interface QuizGenerationConfig {
  questionCount: number; // 1 to 15
  subject: string;
  grade: string;
  curriculum: string; // Mặc định 'Bộ sách Kết nối tri thức với cuộc sống'
  semester: 'Học kỳ 1' | 'Học kỳ 2' | 'Cả năm';
  topic: string; // Tên chủ đề / bài học
  topicDescription: string; // Ô mô tả chi tiết bài học
  questionType: 'all' | QuizQuestionType; // Dạng câu hỏi muốn tạo
  difficulty: QuizDifficulty;
  rewardCoins: number;
}
