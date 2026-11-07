import JSZip from 'jszip';
import { QuestionItem, QuestionType } from '../types';

export const QUESTION_STORAGE_KEY = 'lop_hoc_hanh_phuc_quiz_bank_v2';

// 1. Kho câu hỏi mẫu phong phú sẵn có (Trắc nghiệm có đáp án + Tự luận/bằng lời có đáp án giáo viên)
export const DEFAULT_QUESTIONS: QuestionItem[] = [
  // ==========================================
  // --- MÔN TIẾNG VIỆT (ĐẦY ĐỦ 7 DẠNG CÂU HỎI) ---
  // ==========================================
  {
    id: 'q-tv-mc-1',
    type: 'multiple_choice',
    subject: 'Tiếng Việt',
    questionText: 'Trong các từ sau, từ nào là từ láy tượng thanh gợi tả tiếng cười giòn giã?',
    options: ['Cười ha hả', 'Cười tủm tỉm', 'Cười sặc sụa'],
    correctOptionIndex: 0,
    teacherAnswerKey: '"Ha hả" là từ láy tượng thanh diễn tả tiếng cười to, sảng khoái và giòn giã.',
    pointsReward: 2
  },
  {
    id: 'q-tv-multi-1',
    type: 'multi_select',
    subject: 'Tiếng Việt',
    questionText: 'Những từ nào dưới đây là từ chỉ hoạt động của học sinh trong giờ ra chơi? (Chọn tất cả các đáp án đúng)',
    options: ['Nhảy dây', 'Chăm chỉ', 'Đá cầu', 'Đọc sách', 'Thân thiện'],
    correctOptionIndices: [0, 2, 3],
    teacherAnswerKey: '"Nhảy dây", "Đá cầu", "Đọc sách" là từ chỉ hoạt động; "Chăm chỉ" và "Thân thiện" là từ chỉ phẩm chất, tính cách.',
    pointsReward: 3
  },
  {
    id: 'q-tv-tf-1',
    type: 'true_false',
    subject: 'Tiếng Việt',
    questionText: 'Từ "chăm chỉ" là từ chỉ hoạt động của con người.',
    isTrue: false,
    teacherAnswerKey: 'Khẳng định SAI. "Chăm chỉ" là từ chỉ phẩm chất, tính nết (tính từ), không phải từ chỉ hoạt động (động từ).',
    pointsReward: 2
  },
  {
    id: 'q-tv-fill-1',
    type: 'fill_blank',
    subject: 'Tiếng Việt',
    questionText: 'Nhiễu điều phủ lấy giá [gương], Người trong một nước phải [thương] nhau cùng.',
    blankAnswers: ['gương', 'thương'],
    distractorWords: ['đồng', 'giúp', 'kính', 'yêu'],
    teacherAnswerKey: 'Vị trí 1: "gương" | Vị trí 2: "thương" (Câu ca dao khuyên tình đoàn kết, tương thân tương ái).',
    pointsReward: 3
  },
  {
    id: 'q-tv-seq-1',
    type: 'sequence_order',
    subject: 'Tiếng Việt',
    questionText: 'Em hãy sắp xếp các câu văn sau theo đúng thứ tự logic để tạo thành một đoạn văn hoàn chỉnh:',
    sequenceItems: [
      '1. Mùa xuân đã về trên khắp nẻo đường quê hương.',
      '2. Cây cối đua nhau đâm chồi nảy lộc xanh tươi.',
      '3. Từng đàn chim én ríu rít bay lượn trên bầu trời.',
      '4. Chúng em hân hoan cắp sách đến trường với niềm vui mới.'
    ],
    teacherAnswerKey: 'Trình tự chuẩn: 1. Mùa xuân về -> 2. Cây cối đâm chồi -> 3. Chim én bay lượn -> 4. Em cắp sách đến trường.',
    pointsReward: 4
  },
  {
    id: 'q-tv-match-1',
    type: 'matching',
    subject: 'Tiếng Việt',
    questionText: 'Em hãy nối mỗi từ ngữ ở Cột A với từ trái nghĩa tương ứng ở Cột B:',
    matchingPairs: [
      { left: 'Chăm chỉ', right: 'Lười biếng' },
      { left: 'Dũng cảm', right: 'Hèn nhát' },
      { left: 'Thật thà', right: 'Gian dối' },
      { left: 'Cao thượng', right: 'Hẹp hòi' }
    ],
    teacherAnswerKey: 'Chăm chỉ - Lười biếng | Dũng cảm - Hèn nhát | Thật thà - Gian dối | Cao thượng - Hẹp hòi.',
    pointsReward: 4
  },
  {
    id: 'q-oral-2',
    type: 'oral',
    subject: 'Tiếng Việt',
    questionText: 'Em hãy đọc thuộc lòng một khổ thơ hoặc một câu ca dao, tục ngữ ca ngợi công ơn to lớn của thầy cô giáo?',
    teacherAnswerKey: 'Gợi ý chấm điểm: Học sinh đọc to, rõ ràng, diễn cảm (Ví dụ: "Muốn sang thì bắc cầu Kiều / Muốn con hay chữ phải yêu lấy thầy" hoặc "Không thầy đố mày làm nên").',
    pointsReward: 3
  },

  // ==========================================
  // --- MÔN TOÁN HỌC (ĐẦY ĐỦ 7 DẠNG CÂU HỎI) ---
  // ==========================================
  {
    id: 'q-mc-1',
    type: 'multiple_choice',
    subject: 'Toán học',
    questionText: 'Nếu một hình chữ nhật có chiều dài 12cm và chiều rộng 8cm thì chu vi của hình chữ nhật đó là bao nhiêu?',
    options: ['20 cm', '40 cm', '96 cm', '48 cm'],
    correctOptionIndex: 1,
    teacherAnswerKey: 'Chu vi = (12 + 8) x 2 = 40 (cm).',
    pointsReward: 2
  },
  {
    id: 'q-mc-shapes-1',
    type: 'multiple_choice',
    subject: 'Toán học',
    questionText: 'Trong các hình dưới đây, hình nào là hình chữ nhật?',
    options: ['Hình 1 (Hình vuông)', 'Hình 2 (Hình chữ nhật)', 'Hình 3 (Hình tam giác)', 'Hình 4 (Hình tròn)'],
    optionImages: [
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8fafc"/><rect x="25" y="10" width="70" height="70" fill="%233b82f6" rx="4" stroke="%231d4ed8" stroke-width="3"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8fafc"/><rect x="10" y="20" width="100" height="50" fill="%2310b981" rx="4" stroke="%23047857" stroke-width="3"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8fafc"/><polygon points="60,10 15,80 105,80" fill="%23f59e0b" stroke="%23b45309" stroke-width="3"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8fafc"/><circle cx="60" cy="45" r="35" fill="%23ec4899" stroke="%23be185d" stroke-width="3"/></svg>'
    ],
    correctOptionIndex: 1,
    teacherAnswerKey: 'Hình chữ nhật là hình có 4 góc vuông, 2 cạnh dài bằng nhau và 2 cạnh ngắn bằng nhau (Hình 2 - Màu xanh lá cây).',
    pointsReward: 3
  },
  {
    id: 'q-multi-1',
    type: 'multi_select',
    subject: 'Toán học',
    questionText: 'Trong các số sau, những số nào là số chẵn chia hết cho 2? (Chọn tất cả các đáp án đúng)',
    options: ['12', '15', '24', '37', '48'],
    correctOptionIndices: [0, 2, 4],
    teacherAnswerKey: 'Các số chẵn tận cùng là 0, 2, 4, 6, 8 nên 12, 24, 48 đều chia hết cho 2.',
    pointsReward: 3
  },
  {
    id: 'q-tf-1',
    type: 'true_false',
    subject: 'Toán học',
    questionText: 'Số 0 là số tự nhiên nhỏ nhất trong tập hợp các số tự nhiên.',
    isTrue: true,
    teacherAnswerKey: 'Khẳng định ĐÚNG. Tập hợp số tự nhiên là N = {0, 1, 2, 3, ...} và số 0 là số nhỏ nhất.',
    pointsReward: 2
  },
  {
    id: 'q-math-fill-1',
    type: 'fill_blank',
    subject: 'Toán học',
    questionText: 'Một hình vuông có cạnh 5cm thì chu vi là [20] cm và diện tích là [25] cm2.',
    blankAnswers: ['20', '25'],
    distractorWords: ['10', '15', '30', '50'],
    teacherAnswerKey: 'Chu vi = 5 x 4 = 20 (cm) | Diện tích = 5 x 5 = 25 (cm2).',
    pointsReward: 3
  },
  {
    id: 'q-math-seq-1',
    type: 'sequence_order',
    subject: 'Toán học',
    questionText: 'Hãy sắp xếp các phân số sau theo thứ tự từ bé đến lớn:',
    sequenceItems: [
      '1. Phân số 1/8',
      '2. Phân số 1/4',
      '3. Phân số 1/2',
      '4. Phân số 3/4'
    ],
    teacherAnswerKey: 'Thứ tự từ bé đến lớn: 1/8 < 1/4 < 1/2 < 3/4.',
    pointsReward: 4
  },
  {
    id: 'q-match-1',
    type: 'matching',
    subject: 'Toán học',
    questionText: 'Em hãy nối mỗi phép nhân ở Cột A với kết quả tương ứng ở Cột B:',
    matchingPairs: [
      { left: '6 x 7', right: '42' },
      { left: '8 x 9', right: '72' },
      { left: '5 x 8', right: '40' },
      { left: '7 x 7', right: '49' }
    ],
    teacherAnswerKey: '6x7 = 42 | 8x9 = 72 | 5x8 = 40 | 7x7 = 49.',
    pointsReward: 4
  },

  // ==========================================
  // --- MÔN KHOA HỌC & KỸ NĂNG SỐNG ---
  // ==========================================
  {
    id: 'q-mc-traffic-1',
    type: 'multiple_choice',
    subject: 'Đạo đức & Kỹ năng sống',
    questionText: 'Biển báo nào dưới đây là biển báo dành cho người đi bộ sang đường?',
    options: ['Biển 1: Cấm rẽ', 'Biển 2: Người đi bộ', 'Biển 3: Nguy hiểm', 'Biển 4: Cấm đi ngược chiều'],
    optionImages: [
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><circle cx="50" cy="40" r="32" fill="white" stroke="%23ef4444" stroke-width="6"/><line x1="28" y1="18" x2="72" y2="62" stroke="%23ef4444" stroke-width="5"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><rect x="18" y="8" width="64" height="64" rx="10" fill="%232563eb"/><path d="M45,22 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M42,35 h16 v18 h-6 v15 h-4 v-15 h-6 z" fill="white"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><polygon points="50,10 12,70 88,70" fill="%23facc15" stroke="%23b45309" stroke-width="4"/><line x1="50" y1="30" x2="50" y2="52" stroke="black" stroke-width="5"/><circle cx="50" cy="62" r="3" fill="black"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><circle cx="50" cy="40" r="32" fill="%23ef4444"/><rect x="25" y="35" width="50" height="10" fill="white"/></svg>'
    ],
    correctOptionIndex: 1,
    teacherAnswerKey: 'Biển 2 có nền xanh vuông với hình người đi bộ màu trắng là biển chỉ dẫn nơi dành cho người đi bộ sang đường.',
    pointsReward: 3
  },
  {
    id: 'q-tf-2',
    type: 'true_false',
    subject: 'Khoa học',
    questionText: 'Mặt trời mọc ở hướng Tây và lặn ở hướng Đông.',
    isTrue: false,
    teacherAnswerKey: 'Khẳng định SAI. Trái đất tự quay từ Tây sang Đông nên ta thấy Mặt trời mọc ở hướng Đông và lặn ở hướng Tây.',
    pointsReward: 2
  },
  {
    id: 'q-seq-1',
    type: 'sequence_order',
    subject: 'Khoa học',
    questionText: 'Em hãy sắp xếp các giai đoạn phát triển trong vòng đời của loài Bướm theo đúng trình tự tự nhiên:',
    sequenceItems: [
      '1. Trứng bướm',
      '2. Sâu bướm (Ấu trùng)',
      '3. Nhộng (Kén)',
      '4. Bướm trưởng thành'
    ],
    teacherAnswerKey: 'Trình tự chuẩn: 1. Trứng bướm -> 2. Sâu bướm -> 3. Nhộng (Kén) -> 4. Bướm trưởng thành.',
    pointsReward: 4
  },
  {
    id: 'q-seq-2',
    type: 'sequence_order',
    subject: 'Đạo đức & Kỹ năng sống',
    questionText: 'Hãy sắp xếp các bước sơ cứu ban đầu khi bị chảy máu nhẹ ở ngón tay:',
    sequenceItems: [
      'Bước 1: Rửa sạch vết thương dưới vòi nước sạch',
      'Bước 2: Sát khuẩn vết thương bằng cồn đỏ/nước muối',
      'Bước 3: Dùng gạc sạch băng ép nhẹ để cầm máu',
      'Bước 4: Dán băng cá nhân bảo vệ'
    ],
    teacherAnswerKey: 'Thứ tự đúng: Rửa sạch -> Sát khuẩn -> Băng ép cầm máu -> Dán băng cá nhân.',
    pointsReward: 4
  },
  {
    id: 'q-oral-1',
    type: 'oral',
    subject: 'Đạo đức & Kỹ năng sống',
    questionText: 'Em hãy kể tên 3 việc làm tốt em đã làm trong tuần này để giúp đỡ ông bà, cha mẹ hoặc thầy cô?',
    teacherAnswerKey: 'Gợi ý chấm điểm của giáo viên: Học sinh nêu được từ 2 - 3 việc làm cụ thể, lễ phép và trung thực (như quét nhà, rửa bát, gấp chăn màn, lau bảng, giúp bạn trong giờ học).',
    pointsReward: 3
  },

  // ==========================================
  // --- MÔN TIẾNG ANH & ĐỊA LÝ ---
  // ==========================================
  {
    id: 'q-fill-1',
    type: 'fill_blank',
    subject: 'Lịch sử & Địa lý',
    questionText: 'Thủ đô của nước Việt Nam là [Hà Nội]. Thành phố có con sông [Hồng] uốn lượn chảy qua.',
    blankAnswers: ['Hà Nội', 'Hồng'],
    distractorWords: ['Đà Nẵng', 'Hồ Chí Minh', 'Mê Kông', 'Đồng Nai'],
    teacherAnswerKey: 'Vị trí 1: "Hà Nội" | Vị trí 2: "Hồng" (Sông Hồng).',
    pointsReward: 3
  },
  {
    id: 'q-fill-2',
    type: 'fill_blank',
    subject: 'Tiếng Anh',
    questionText: 'There are seven days in a [week]. Monday is the [first] day of the school week.',
    blankAnswers: ['week', 'first'],
    distractorWords: ['month', 'year', 'last', 'second'],
    teacherAnswerKey: 'There are seven days in a week. Monday is the first day of the school week.',
    pointsReward: 3
  },
  {
    id: 'q-match-2',
    type: 'matching',
    subject: 'Tiếng Anh',
    questionText: 'Hãy nối các từ tiếng Anh ở Cột A với nghĩa tiếng Việt tương ứng ở Cột B:',
    matchingPairs: [
      { left: 'Teacher', right: 'Thầy/Cô giáo' },
      { left: 'Student', right: 'Học sinh' },
      { left: 'Book', right: 'Quyển sách' },
      { left: 'Classroom', right: 'Phòng học' }
    ],
    teacherAnswerKey: 'Teacher: Thầy cô giáo | Student: Học sinh | Book: Quyển sách | Classroom: Phòng học.',
    pointsReward: 4
  }
];

// Helper: Gộp thông minh tự động (Smart Merge Upgrade) bảo toàn câu hỏi của user và bổ sung các câu hỏi mẫu 7 dạng còn thiếu
export function smartMergeQuizBank(currentQuestions: QuestionItem[]): QuestionItem[] {
  if (!Array.isArray(currentQuestions) || currentQuestions.length === 0) {
    return DEFAULT_QUESTIONS;
  }

  const existingIds = new Set(currentQuestions.map(q => q.id));
  const missingDefaults = DEFAULT_QUESTIONS.filter(dq => !existingIds.has(dq.id));

  // Kiểm tra xem danh sách đã có đủ các dạng câu hỏi cơ bản hay chưa
  const typesInCurrent = new Set(currentQuestions.map(q => q.type));
  const hasAllNewTypes = 
    typesInCurrent.has('multi_select') &&
    typesInCurrent.has('true_false') &&
    typesInCurrent.has('fill_blank') &&
    typesInCurrent.has('sequence_order') &&
    typesInCurrent.has('matching');

  // Nếu còn thiếu câu hỏi mẫu hoặc thiếu các dạng mới, tự động merge
  if (!hasAllNewTypes || missingDefaults.length > 0) {
    return [...currentQuestions, ...missingDefaults];
  }

  return currentQuestions;
}

// Helper: Tải câu hỏi và TỰ ĐỘNG GỘP CÁC DẠNG MỚI (Smart Merge Upgrade)
export function loadQuizBank(): QuestionItem[] {
  try {
    const saved = localStorage.getItem(QUESTION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = smartMergeQuizBank(parsed);
        if (merged.length !== parsed.length) {
          saveQuizBank(merged);
        }
        return merged;
      }
    }
  } catch (err) {
    console.error('Lỗi khi đọc kho câu hỏi:', err);
  }
  return DEFAULT_QUESTIONS;
}

// Helper: Lưu câu hỏi vào localStorage
export function saveQuizBank(questions: QuestionItem[]): void {
  try {
    localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(questions));
  } catch (err) {
    console.warn('Lỗi khi lưu kho câu hỏi:', err);
  }
}

// 2. PARSE TỪ VĂN BẢN (Text regex parser)
export function parseQuestionsFromRawText(rawText: string, defaultSubject = 'Tổng hợp'): QuestionItem[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const items: QuestionItem[] = [];
  let currentQuestion: Partial<QuestionItem> | null = null;

  const isQuestionStart = (line: string) => {
    return /^(câu\s*\d+|bài\s*\d+|\d+[\.\:\)\/])/i.test(line);
  };

  const isOptionLine = (line: string) => {
    return /^[A-D][\.\:\)\/]/i.test(line);
  };

  const isAnswerKeyLine = (line: string) => {
    return /^(đáp\s*án|trả\s*lời|key|hướng\s*dẫn|đ\/a)[\:\.]/i.test(line);
  };

  const saveCurrent = () => {
    if (currentQuestion && currentQuestion.questionText) {
      const isMC = (currentQuestion.options && currentQuestion.options.length >= 2);
      items.push({
        id: `q-parsed-${Date.now()}-${items.length}-${Math.random().toString(36).substring(2, 6)}`,
        type: isMC ? 'multiple_choice' : 'oral',
        subject: currentQuestion.subject || defaultSubject,
        questionText: currentQuestion.questionText.trim(),
        options: isMC ? currentQuestion.options : undefined,
        correctOptionIndex: currentQuestion.correctOptionIndex ?? 0,
        teacherAnswerKey: currentQuestion.teacherAnswerKey || (isMC ? `Đáp án đúng là ${String.fromCharCode(65 + (currentQuestion.correctOptionIndex ?? 0))}` : 'Học sinh trả lời đầy đủ, tự tin.'),
        pointsReward: currentQuestion.pointsReward || 2
      });
    }
    currentQuestion = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isQuestionStart(line)) {
      saveCurrent();
      const cleaned = line.replace(/^(câu\s*\d+|bài\s*\d+|\d+[\.\:\)\/])[\s\.\:\-]*/i, '').trim();
      currentQuestion = {
        questionText: cleaned || line,
        options: [],
        subject: defaultSubject
      };
    } else if (isAnswerKeyLine(line) && currentQuestion) {
      const ansPart = line.replace(/^(đáp\s*án|trả\s*lời|key|hướng\s*dẫn|đ\/a)[\:\.\s]*/i, '').trim();
      currentQuestion.teacherAnswerKey = ansPart;

      // Check if letter A, B, C, D
      const matchLetter = ansPart.match(/^([A-D])/i);
      if (matchLetter) {
        const letter = matchLetter[1].toUpperCase();
        currentQuestion.correctOptionIndex = letter.charCodeAt(0) - 65;
      }
    } else if (isOptionLine(line) && currentQuestion) {
      // Could be inline options like "A. ... B. ... C. ... D. ..." or single line "A. ..."
      const optionMatches = line.matchAll(/([A-D])[\.\:\)\/]\s*([^A-D\.\:\)]+)/gi);
      let foundMatches = false;
      for (const m of optionMatches) {
        foundMatches = true;
        const optText = m[2].trim();
        if (optText) {
          if (!currentQuestion.options) currentQuestion.options = [];
          currentQuestion.options.push(optText);
        }
      }
      if (!foundMatches) {
        const optText = line.replace(/^[A-D][\.\:\)\/]\s*/i, '').trim();
        if (!currentQuestion.options) currentQuestion.options = [];
        currentQuestion.options.push(optText);
      }
    } else {
      if (currentQuestion) {
        if (!currentQuestion.options || currentQuestion.options.length === 0) {
          currentQuestion.questionText += ' ' + line;
        } else {
          // append to answer key or last option
          currentQuestion.teacherAnswerKey = (currentQuestion.teacherAnswerKey ? currentQuestion.teacherAnswerKey + ' ' : '') + line;
        }
      } else {
        // Line without number: start question
        currentQuestion = {
          questionText: line,
          options: [],
          subject: defaultSubject
        };
      }
    }
  }

  saveCurrent();
  return items;
}

// 3. PARSE TỪ FILE WORD (.docx)
export async function parseDocxFile(file: File, subjectOverride?: string): Promise<QuestionItem[]> {
  try {
    const zip = await JSZip.loadAsync(file);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('Không tìm thấy nội dung văn bản document.xml trong file Word (.docx).');
    }

    const xmlText = await docXmlFile.async('text');
    
    // Extract text from <w:p> paragraphs and <w:t> nodes
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    const paragraphs = xmlDoc.getElementsByTagName('w:p');

    const rawLines: string[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const textNodes = p.getElementsByTagName('w:t');
      let pText = '';
      for (let j = 0; j < textNodes.length; j++) {
        pText += textNodes[j].textContent || '';
      }
      if (pText.trim()) {
        rawLines.push(pText.trim());
      }
    }

    const assignedSubject = subjectOverride?.trim() || file.name.replace(/\.[^/.]+$/, '');
    const combined = rawLines.join('\n');
    const parsed = parseQuestionsFromRawText(combined, assignedSubject);
    if (parsed.length > 0) {
      return parsed.map(q => ({ ...q, subject: assignedSubject }));
    }

    // Fallback: If regex didn't find question numbers, create items line by line
    return rawLines.slice(0, 20).map((line, idx) => ({
      id: `docx-${Date.now()}-${idx}`,
      type: 'oral',
      subject: assignedSubject,
      questionText: line,
      teacherAnswerKey: 'Học sinh phát biểu và trả lời đầy đủ ý.',
      pointsReward: 2
    }));
  } catch (err: any) {
    console.error('Lỗi phân tích file Word:', err);
    throw new Error('Không thể phân tích file Word: ' + (err.message || 'Định dạng không được hỗ trợ.'));
  }
}

// 4. PARSE TỪ FILE PDF (.pdf)
export async function parsePdfFile(file: File, subjectOverride?: string): Promise<QuestionItem[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Decode text using standard decoder
    let text = '';
    try {
      const decoder = new TextDecoder('utf-8');
      text = decoder.decode(bytes);
    } catch {
      text = '';
    }

    // Extract printable ASCII/Unicode chunks from PDF
    const textMatches = text.match(/\(([^)]+)\)|\[([^\]]+)\]/g) || [];
    let extracted = textMatches.map(m => m.replace(/[\(\)\[\]]/g, '')).join(' ');

    if (!extracted || extracted.length < 50) {
      // Try string stream matching
      const cleanAscii = text.replace(/[^\x20-\x7E\u00C0-\u1EF9]/g, ' ');
      extracted = cleanAscii;
    }

    const assignedSubject = subjectOverride?.trim() || file.name.replace(/\.[^/.]+$/, '');
    const parsed = parseQuestionsFromRawText(extracted, assignedSubject);
    if (parsed.length > 0) {
      return parsed.map(q => ({ ...q, subject: assignedSubject }));
    }

    // Fallback question
    return [
      {
        id: `pdf-${Date.now()}-1`,
        type: 'oral',
        subject: assignedSubject,
        questionText: `Câu hỏi từ tài liệu PDF [${file.name}]: Em hãy trình bày nội dung bài học chính hôm nay?`,
        teacherAnswerKey: 'Học sinh trình bày đúng trọng tâm kiến thức.',
        pointsReward: 2
      }
    ];
  } catch (err: any) {
    console.error('Lỗi đọc PDF:', err);
    throw new Error('Không thể đọc file PDF: ' + (err.message || 'Định dạng không hỗ trợ.'));
  }
}

// 5. PARSE TỪ HÌNH ẢNH QUA GEMINI AI HOẶC SCAN TEXT
export async function parseImageFileWithAi(file: File, subjectOverride?: string): Promise<QuestionItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64Data = dataUrl.split(',')[1];
        const mimeType = file.type || 'image/jpeg';
        const assignedSubject = subjectOverride?.trim() || 'Hình ảnh';

        const prompt = `Bạn là trợ lý giáo viên tiểu học. Hãy đọc hình ảnh bài tập / đề thi này và trích xuất danh sách câu hỏi.
Trả về DUY NHẤT một mảng JSON thuần túy (không kèm markdown \`\`\`json) theo đúng cấu trúc TypeScript:
[
  {
    "type": "multiple_choice" hoặc "oral",
    "subject": "${assignedSubject}",
    "questionText": "Nội dung câu hỏi...",
    "options": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"], // Chỉ cần khi type là multiple_choice
    "correctOptionIndex": 0, // 0 cho A, 1 cho B, 2 cho C, 3 cho D (nếu là trắc nghiệm)
    "teacherAnswerKey": "Đáp án hoặc hướng dẫn chấm của giáo viên",
    "pointsReward": 2
  }
]`;

        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            imageBase64: base64Data,
            mimeType: mimeType
          })
        });

        if (res.ok) {
          const jsonRes = await res.json();
          let rawText = jsonRes.text || '';
          rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const result: QuestionItem[] = parsed.map((item, idx) => ({
              id: `img-ai-${Date.now()}-${idx}`,
              type: item.type === 'multiple_choice' ? 'multiple_choice' : 'oral',
              subject: item.subject || assignedSubject,
              questionText: item.questionText || `Câu hỏi ${idx + 1}`,
              options: Array.isArray(item.options) ? item.options : undefined,
              correctOptionIndex: typeof item.correctOptionIndex === 'number' ? item.correctOptionIndex : 0,
              teacherAnswerKey: item.teacherAnswerKey || 'Giáo viên đối chiếu đáp án.',
              pointsReward: item.pointsReward || 2,
              image: dataUrl
            }));
            return resolve(result);
          }
        }

        // If AI is unavailable or fails, generate interactive image challenge
        resolve([
          {
            id: `img-manual-${Date.now()}`,
            type: 'oral',
            subject: assignedSubject,
            questionText: `[Câu hỏi hình ảnh]: Em hãy quan sát bức ảnh và nêu câu trả lời hoặc nhận xét của em?`,
            image: dataUrl,
            teacherAnswerKey: 'Học sinh quan sát tranh và trả lời lưu loát.',
            pointsReward: 3
          }
        ]);
      } catch (err) {
        console.error('Lỗi gọi AI trích xuất hình ảnh:', err);
        const assignedSubject = subjectOverride?.trim() || 'Hình ảnh bài tập';
        // Fallback item with the image attached
        resolve([
          {
            id: `img-fallback-${Date.now()}`,
            type: 'oral',
            subject: assignedSubject,
            questionText: `Em hãy nhìn vào hình ảnh bài tập đã tải lên và trả lời câu hỏi của thầy/cô?`,
            image: reader.result as string,
            teacherAnswerKey: 'Học sinh trả lời đúng câu hỏi trong hình ảnh.',
            pointsReward: 2
          }
        ]);
      }
    };
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
}
