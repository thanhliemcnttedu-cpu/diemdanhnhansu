import JSZip from 'jszip';
import { QuestionItem, QuestionType } from '../types';
import { isLegacySample } from './legacySampleQuestions';

export const QUESTION_STORAGE_KEY = 'lop_hoc_hanh_phuc_quiz_bank_v2';

// 1. BỘ CÂU HỎI MẪU (11/2026): 7 môn × 3 câu = 21 câu, đủ 7 dạng (mỗi dạng 3 câu) — để giáo viên xem cách ra từng dạng câu.
//    Mã câu mẫu bắt đầu bằng "s2-". Câu mẫu cũ: utils/legacySampleQuestions.ts (chỉ để nhận ra và loại bỏ khỏi kho đã lưu).
const SHAPE = (body: string) => `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8fafc"/>${body}</svg>`;

export const DEFAULT_QUESTIONS: QuestionItem[] = [
  // ───────── TIẾNG VIỆT: Một đáp án · Điền chỗ trống · Sắp xếp
  {
    id: 's2-tv-1',
    type: 'multiple_choice',
    subject: 'Tiếng Việt',
    questionText: 'Từ nào dưới đây viết ĐÚNG chính tả?',
    options: ['Xum xuê', 'Sum suê', 'Xum suê', 'Sum xuê'],
    correctOptionIndex: 1,
    teacherAnswerKey: '"Sum suê" (cây cối sum suê) viết với "s" ở cả hai tiếng.',
    pointsReward: 2
  },
  {
    id: 's2-tv-2',
    type: 'fill_blank',
    subject: 'Tiếng Việt',
    questionText: 'Công cha như núi [___], nghĩa mẹ như nước trong nguồn chảy ra.',
    blankAnswers: ['Thái Sơn'],
    distractorWords: ['Ba Vì', 'Trường Sơn'],
    teacherAnswerKey: 'Câu ca dao: "Công cha như núi Thái Sơn, Nghĩa mẹ như nước trong nguồn chảy ra."',
    pointsReward: 2
  },
  {
    id: 's2-tv-3',
    type: 'sequence_order',
    subject: 'Tiếng Việt',
    questionText: 'Sắp xếp các từ sau thành một câu hoàn chỉnh:',
    sequenceItems: ['Mẹ', 'em', 'đang', 'nấu cơm', 'trong bếp.'],
    teacherAnswerKey: 'Mẹ em đang nấu cơm trong bếp.',
    pointsReward: 3
  },

  // ───────── TOÁN HỌC: Một đáp án (có ảnh) · Đúng/Sai · Nối cột
  {
    id: 's2-toan-1',
    type: 'multiple_choice',
    subject: 'Toán học',
    questionText: 'Hình nào dưới đây là hình chữ nhật?',
    options: ['Hình 1', 'Hình 2', 'Hình 3', 'Hình 4'],
    optionImages: [
      SHAPE('<rect x="25" y="10" width="70" height="70" fill="%233b82f6" rx="4" stroke="%231d4ed8" stroke-width="3"/>'),
      SHAPE('<rect x="10" y="20" width="100" height="50" fill="%2310b981" rx="4" stroke="%23047857" stroke-width="3"/>'),
      SHAPE('<polygon points="60,10 15,80 105,80" fill="%23f59e0b" stroke="%23b45309" stroke-width="3"/>'),
      SHAPE('<circle cx="60" cy="45" r="35" fill="%23ec4899" stroke="%23be185d" stroke-width="3"/>')
    ],
    correctOptionIndex: 1,
    teacherAnswerKey: 'Hình chữ nhật có 4 góc vuông, 2 cạnh dài bằng nhau và 2 cạnh ngắn bằng nhau (Hình 2). Hình 1 là hình vuông.',
    pointsReward: 2
  },
  {
    id: 's2-toan-2',
    type: 'true_false',
    subject: 'Toán học',
    questionText: 'Hình vuông có 4 cạnh bằng nhau và 4 góc vuông.',
    isTrue: true,
    teacherAnswerKey: 'ĐÚNG. Hình vuông có 4 cạnh bằng nhau và 4 góc vuông.',
    pointsReward: 2
  },
  {
    id: 's2-toan-3',
    type: 'matching',
    subject: 'Toán học',
    questionText: 'Nối mỗi phép tính với kết quả đúng:',
    matchingPairs: [
      { left: '6 × 7', right: '42' },
      { left: '45 : 5', right: '9' },
      { left: '25 + 38', right: '63' },
      { left: '100 − 27', right: '73' }
    ],
    teacherAnswerKey: '6 × 7 = 42 · 45 : 5 = 9 · 25 + 38 = 63 · 100 − 27 = 73.',
    pointsReward: 3
  },

  // ───────── TIẾNG ANH: Nối cột · Điền chỗ trống · Trả lời miệng
  {
    id: 's2-ta-1',
    type: 'matching',
    subject: 'Tiếng Anh',
    questionText: 'Match the English words with their Vietnamese meanings:',
    matchingPairs: [
      { left: 'Apple', right: 'Quả táo' },
      { left: 'Cat', right: 'Con mèo' },
      { left: 'Book', right: 'Quyển sách' },
      { left: 'Red', right: 'Màu đỏ' }
    ],
    teacherAnswerKey: 'Apple – Quả táo · Cat – Con mèo · Book – Quyển sách · Red – Màu đỏ.',
    pointsReward: 3
  },
  {
    id: 's2-ta-2',
    type: 'fill_blank',
    subject: 'Tiếng Anh',
    questionText: 'I [___] a student.',
    blankAnswers: ['am'],
    distractorWords: ['is', 'are'],
    teacherAnswerKey: 'I am a student. (Chủ ngữ "I" đi với "am".)',
    pointsReward: 2
  },
  {
    id: 's2-ta-3',
    type: 'oral',
    subject: 'Tiếng Anh',
    questionText: 'Introduce yourself in English: your name, your age and your favourite colour.',
    teacherAnswerKey: 'Gợi ý: My name is … I am … years old. My favourite colour is …',
    pointsReward: 3
  },

  // ───────── KHOA HỌC: Nhiều đáp án · Đúng/Sai · Sắp xếp
  {
    id: 's2-kh-1',
    type: 'multi_select',
    subject: 'Khoa học',
    questionText: 'Những vật nào dưới đây DẪN ĐIỆN tốt? (Chọn tất cả đáp án đúng)',
    options: ['Dây đồng', 'Thìa nhôm', 'Thước nhựa', 'Đinh sắt', 'Cục tẩy'],
    correctOptionIndices: [0, 1, 3],
    teacherAnswerKey: 'Kim loại (đồng, nhôm, sắt) dẫn điện tốt; nhựa và cao su (cục tẩy) cách điện.',
    pointsReward: 3
  },
  {
    id: 's2-kh-2',
    type: 'true_false',
    subject: 'Khoa học',
    questionText: 'Ở điều kiện bình thường, nước sôi ở 100°C.',
    isTrue: true,
    teacherAnswerKey: 'ĐÚNG. Ở áp suất khí quyển bình thường, nước sôi ở 100°C.',
    pointsReward: 2
  },
  {
    id: 's2-kh-3',
    type: 'sequence_order',
    subject: 'Khoa học',
    questionText: 'Sắp xếp các giai đoạn trong vòng đời của con bướm:',
    sequenceItems: ['Trứng', 'Sâu (ấu trùng)', 'Nhộng', 'Bướm trưởng thành'],
    teacherAnswerKey: 'Trứng → Sâu → Nhộng → Bướm.',
    pointsReward: 3
  },

  // ───────── LỊCH SỬ & ĐỊA LÝ: Một đáp án · Nối cột · Điền chỗ trống
  {
    id: 's2-lsdl-1',
    type: 'multiple_choice',
    subject: 'Lịch sử & Địa lý',
    questionText: 'Thủ đô của nước Cộng hòa xã hội chủ nghĩa Việt Nam là thành phố nào?',
    options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'Thành phố Hồ Chí Minh'],
    correctOptionIndex: 0,
    teacherAnswerKey: 'Thủ đô của Việt Nam là Hà Nội.',
    pointsReward: 2
  },
  {
    id: 's2-lsdl-2',
    type: 'matching',
    subject: 'Lịch sử & Địa lý',
    questionText: 'Nối mỗi nhân vật lịch sử với sự kiện gắn với nhân vật đó:',
    matchingPairs: [
      { left: 'Hai Bà Trưng', right: 'Khởi nghĩa năm 40' },
      { left: 'Ngô Quyền', right: 'Chiến thắng Bạch Đằng năm 938' },
      { left: 'Lý Thái Tổ', right: 'Dời đô về Thăng Long năm 1010' },
      { left: 'Quang Trung', right: 'Đại phá quân Thanh năm 1789' }
    ],
    teacherAnswerKey: 'Hai Bà Trưng – năm 40 · Ngô Quyền – Bạch Đằng 938 · Lý Thái Tổ – dời đô 1010 · Quang Trung – đại phá quân Thanh 1789.',
    pointsReward: 4
  },
  {
    id: 's2-lsdl-3',
    type: 'fill_blank',
    subject: 'Lịch sử & Địa lý',
    questionText: 'Đỉnh núi cao nhất Việt Nam là đỉnh [___], thuộc dãy Hoàng Liên Sơn.',
    blankAnswers: ['Phan-xi-păng'],
    distractorWords: ['Bạch Mã', 'Ngọc Linh'],
    teacherAnswerKey: 'Phan-xi-păng (khoảng 3 143 m) – "nóc nhà Đông Dương".',
    pointsReward: 2
  },

  // ───────── ĐẠO ĐỨC & KỸ NĂNG SỐNG: Đúng/Sai · Trả lời miệng · Nhiều đáp án
  {
    id: 's2-dd-1',
    type: 'true_false',
    subject: 'Đạo đức & Kỹ năng sống',
    questionText: 'Khi đi bộ qua đường, em nên đi trên vạch kẻ dành cho người đi bộ.',
    isTrue: true,
    teacherAnswerKey: 'ĐÚNG. Qua đường ở vạch kẻ dành cho người đi bộ, quan sát kĩ và đi khi đèn tín hiệu cho phép.',
    pointsReward: 2
  },
  {
    id: 's2-dd-2',
    type: 'oral',
    subject: 'Đạo đức & Kỹ năng sống',
    questionText: 'Em hãy kể một việc tốt em đã làm để giúp đỡ bạn bè hoặc người thân.',
    teacherAnswerKey: 'Gợi ý: giảng bài cho bạn, cho bạn mượn đồ dùng học tập, giúp bố mẹ việc nhà, chăm sóc em nhỏ…',
    pointsReward: 3
  },
  {
    id: 's2-dd-3',
    type: 'multi_select',
    subject: 'Đạo đức & Kỹ năng sống',
    questionText: 'Những việc làm nào thể hiện lòng biết ơn thầy cô? (Chọn tất cả đáp án đúng)',
    options: ['Chăm chú nghe giảng', 'Lễ phép chào hỏi thầy cô', 'Nói chuyện riêng trong giờ học', 'Làm bài tập đầy đủ'],
    correctOptionIndices: [0, 1, 3],
    teacherAnswerKey: 'Chăm chú nghe giảng, lễ phép, làm bài đầy đủ là biết ơn thầy cô; nói chuyện riêng là chưa ngoan.',
    pointsReward: 3
  },

  // ───────── TIN HỌC: Nhiều đáp án · Sắp xếp · Trả lời miệng
  {
    id: 's2-tin-1',
    type: 'multi_select',
    subject: 'Tin học',
    questionText: 'Những thiết bị nào dùng để ĐƯA THÔNG TIN VÀO máy tính? (Chọn tất cả đáp án đúng)',
    options: ['Bàn phím', 'Chuột', 'Màn hình', 'Loa'],
    correctOptionIndices: [0, 1],
    teacherAnswerKey: 'Bàn phím và chuột là thiết bị vào; màn hình và loa là thiết bị ra.',
    pointsReward: 3
  },
  {
    id: 's2-tin-2',
    type: 'sequence_order',
    subject: 'Tin học',
    questionText: 'Sắp xếp các bước tắt máy tính đúng cách:',
    sequenceItems: ['Lưu bài và đóng các chương trình đang mở', 'Bấm nút Bắt đầu (Start)', 'Chọn Nguồn (Power)', 'Chọn Tắt máy (Shut down)'],
    teacherAnswerKey: 'Lưu bài, đóng chương trình → Start → Power → Shut down.',
    pointsReward: 3
  },
  {
    id: 's2-tin-3',
    type: 'oral',
    subject: 'Tin học',
    questionText: 'Em hãy nêu 2 quy tắc an toàn khi sử dụng Internet.',
    teacherAnswerKey: 'Gợi ý: không chia sẻ mật khẩu, thông tin cá nhân; không bấm vào đường link lạ; không kết bạn với người lạ; báo bố mẹ / thầy cô khi gặp điều khó chịu.',
    pointsReward: 3
  }
];

// Helper: Gộp thông minh tự động (Smart Merge Upgrade) bảo toàn câu hỏi của user và bổ sung các câu hỏi mẫu 7 dạng còn thiếu
export function smartMergeQuizBank(currentQuestionsRaw: QuestionItem[]): QuestionItem[] {
  if (!Array.isArray(currentQuestionsRaw) || currentQuestionsRaw.length === 0) {
    return DEFAULT_QUESTIONS;
  }
  // Bỏ câu mẫu CŨ chưa sửa (đã thay bằng bộ mẫu mới) — câu mẫu cũ giáo viên đã sửa vẫn giữ
  const currentQuestions = currentQuestionsRaw.filter(q => !isLegacySample(q));
  if (currentQuestions.length === 0) return DEFAULT_QUESTIONS;

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
