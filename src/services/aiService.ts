import { QuizGenerationConfig, QuizQuestion, QuizQuestionType, MatchingPair } from '../types/quiz';

/**
 * Service to interact with the backend Gemini AI proxy.
 * Calls /api/ai/generate securely without exposing keys to the browser.
 * Provides fallback heuristic generators if the server API key is not configured.
 */

export interface AiFileAttachmentPayload {
  name: string;
  mimeType: string;
  data?: string;
  textContent?: string;
  sizeFormatted?: string;
}

export interface AiGenerateOptions {
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  model?: string;
  imageBase64?: string;
  mimeType?: string;
  files?: AiFileAttachmentPayload[];
}

export async function callGeminiAi(options: AiGenerateOptions): Promise<string> {
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.text) {
      return data.text;
    }
    throw new Error('Không nhận được văn bản từ AI.');
  } catch (err: any) {
    console.warn('Backend Gemini API call fallback:', err.message);
    throw err;
  }
}

/**
 * Xáo trộn ngẫu nhiên danh sách các ý ở Cột B sao cho KHÔNG nối ngang hàng
 * (Đảm bảo mỗi phần tử ở Cột B tại dòng i KHÔNG trùng với đáp án đúng của Cột A tại dòng i).
 */
export function shuffleMatchingRight(pairs: MatchingPair[]): string[] {
  if (!pairs || pairs.length === 0) return [];
  const original = pairs.map(p => p.right);
  if (original.length <= 1) return [...original];

  // Thuật toán tìm hoán vị ngẫu nhiên không có điểm cố định (Derangement)
  for (let attempt = 0; attempt < 50; attempt++) {
    const shuffled = [...original].sort(() => Math.random() - 0.5);
    // Kiểm tra không có vị trí nào nối ngang
    const hasHorizontalMatch = shuffled.some((val, idx) => val === original[idx]);
    if (!hasHorizontalMatch) {
      return shuffled;
    }
  }

  // Phương án dự phòng: Dịch vòng 1 bước (Cyclic Shift) chắc chắn không có phần tử nào ở vị trí cũ
  return [...original.slice(1), original[0]];
}

// Fallback intelligent generators for classroom scenarios
export function generateSmartRemarksFallback(studentName: string, points: number, attendanceState?: string): string {
  const isExcellent = points >= 30;
  const isGood = points >= 15 && points < 30;
  const isAverage = points >= 5 && points < 15;

  if (isExcellent) {
    return `Em ${studentName} là tấm gương sáng của lớp! Rất tích cực hăng hái phát biểu xây dựng bài, chăm chỉ hoàn thành nhiệm vụ và luôn sẵn lòng giúp đỡ bạn bè xung quanh. Em đạt tổng số ${points} xu thi đua xuất sắc. Đề nghị gia đình tiếp tục khích lệ để em phát huy tối đa tiềm năng và tinh thần học tập gương mẫu!`;
  } else if (isGood) {
    return `Em ${studentName} có ý thức học tập rất tốt, đi học chuyên cần và có nhiều tiến bộ rõ rệt trong các giờ học (đạt ${points} xu). Em biết lắng nghe và hợp tác tốt với các bạn trong tổ. Nếu em tự tin phát biểu nhiều hơn nữa trong các môn tự nhiên, em sẽ đạt kết quả vượt trội hơn nữa.`;
  } else if (isAverage) {
    return `Em ${studentName} ngoan ngoãn, hòa đồng với thầy cô và bạn bè. Trong tuần vừa qua em đã có nhiều nỗ lực và tích lũy được ${points} xu. Thầy/Cô mong em tập trung hơn ở nửa sau tiết học, chủ động giơ tay đóng góp ý kiến để nhận thêm nhiều phần quà thi đua xứng đáng.`;
  } else {
    return `Em ${studentName} có tinh thần lễ phép, hòa nhã với bạn bè. Tuy nhiên trong thời gian gần đây, số xu thi đua của em còn khiêm tốn (${points} xu) và đôi lúc còn chưa tập trung hoặc thiếu chuẩn bị bài. Thầy/Cô và lớp luôn tin tưởng vào em! Gia đình hãy cùng đồng hành, động viên em mỗi ngày để em lấy lại phong độ tự tin nhé!`;
  }
}

export function generateSmartParentMessageFallback(className: string, studentName: string, points: number): string {
  return `Kính gửi Quý Phụ huynh em ${studentName} (Lớp ${className}),
Thầy/Cô chủ nhiệm xin gửi lời chào trân trọng từ "Lớp Học Hạnh Phúc"!
Trong tuần học vừa qua, em ${studentName} đã tích lũy được ${points} xu thi đua qua các hoạt động học tập và rèn luyện nền nếp. Em luôn giữ được nét hồn nhiên, tích cực và có nhiều khoảnh khắc đáng yêu trong lớp.
Thầy/Cô rất mong Phụ huynh dành cho con một lời khen ngợi hoặc một cái ôm khích lệ vào bữa tối nay để con thêm hào hứng đến trường mỗi ngày.
Trân trọng cảm ơn sự phối hợp tuyệt vời của Quý Phụ huynh! ❤️`;
}

// Helper: Rich fallbacks specifically for "Bộ sách Kết nối tri thức với cuộc sống"
export function generateKetNoiTriThucQuizFallback(config: QuizGenerationConfig): QuizQuestion[] {
  const { subject, grade, difficulty, questionType, questionCount, topic, topicDescription, rewardCoins } = config;
  const coins = rewardCoins || (difficulty === 'KHÓ' ? 10 : difficulty === 'TRUNG BÌNH' ? 5 : 3);

  const pool: QuizQuestion[] = [];

  // Toán - Kết nối tri thức
  if (subject.toLowerCase().includes('toán')) {
    pool.push({
      id: 'fb-math-1',
      type: 'single_choice',
      difficulty: 'DỄ',
      subject: 'Toán',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Phép tính & Tư duy số học',
      question: `[Toán - Kết nối tri thức] Đố vui khởi động: Nếu có 3 con mèo bắt được 3 con chuột trong 3 phút, thì cần bao nhiêu con mèo để bắt được 100 con chuột trong 100 phút?`,
      options: ['100 con mèo', '3 con mèo', '30 con mèo', '1 con mèo'],
      correctOptionIndices: [1],
      explanation: 'Mỗi con mèo mất 3 phút để bắt được 1 con chuột. Vậy 3 con mèo trong 100 phút vẫn bắt được đúng 100 con chuột!',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-math-2',
      type: 'multiple_choice',
      difficulty: 'TRUNG BÌNH',
      subject: 'Toán',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Dấu hiệu chia hết & Tính chất số',
      question: `[Toán - Kết nối tri thức] Trong các số sau: 120, 245, 360, 415, hãy chọn ĐÚNG 2 số đồng thời chia hết cho cả 2, 5 và 3?`,
      options: ['120', '245', '360', '415'],
      correctOptionIndices: [0, 2],
      explanation: 'Số chia hết cho 2 và 5 phải có tận cùng là 0 (loại 245 và 415). Số 120 có tổng các chữ số 1+2+0=3 (chia hết cho 3). Số 360 có tổng 3+6+0=9 (chia hết cho 3). Vậy có 2 số là 120 và 360.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-math-3',
      type: 'true_false',
      difficulty: 'DỄ',
      subject: 'Toán',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Hình học phẳng',
      question: `[Toán - Kết nối tri thức] Hãy đánh giá tính Đúng / Sai của nhận định hình học sau:`,
      statement: 'Mọi hình vuông đều là hình chữ nhật đặc biệt có 4 cạnh bằng nhau.',
      isTrue: true,
      explanation: 'Đúng! Hình chữ nhật có 4 góc vuông; khi có thêm điều kiện 4 cạnh bằng nhau thì nó trở thành hình vuông.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-math-4',
      type: 'matching',
      difficulty: 'TRUNG BÌNH',
      subject: 'Toán',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Đo lường & Đổi đơn vị',
      question: `[Toán - Kết nối tri thức] Em hãy nối mỗi đơn vị đo ở Cột A với giá trị tương đương ở Cột B:`,
      matchingPairs: [
        { id: 'm1', left: '1 thế kỉ', right: '100 năm' },
        { id: 'm2', left: '1 tấn', right: '1000 kg' },
        { id: 'm3', left: '1 mét vuông (1 m²)', right: '100 dm²' },
        { id: 'm4', left: '1 giờ 15 phút', right: '75 phút' },
      ],
      explanation: '1 thế kỉ = 100 năm; 1 tấn = 1000 kg; 1 m² = 100 dm²; 1 giờ 15 phút = 60 + 15 = 75 phút.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-math-5',
      type: 'essay',
      difficulty: 'KHÓ',
      subject: 'Toán',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Bài toán giải bằng nhiều bước',
      question: `[Toán - Kết nối tri thức] Thử thách tư duy: An có 24 viên bi. Bình có số bi bằng một nửa số bi của An. Cường có số bi gấp đôi tổng số bi của cả An và Bình. Hỏi Cường có bao nhiêu viên bi và nêu cách tính của em?`,
      sampleAnswer: 'Bình có: 24 : 2 = 12 viên bi. Tổng số bi của An và Bình là: 24 + 12 = 36 viên. Cường có: 36 x 2 = 72 viên bi.',
      scoringCriteria: 'Tính đúng số bi của Bình (12 viên), tổng An + Bình (36 viên) và kết quả của Cường (72 viên).',
      explanation: 'Bài toán tính gộp nhiều bước: 24 / 2 = 12, (24 + 12) * 2 = 72 viên bi.',
      rewardCoins: coins,
    });
  } 
  // Tiếng Việt / Ngữ văn
  else if (subject.toLowerCase().includes('tiếng việt') || subject.toLowerCase().includes('ngữ văn')) {
    pool.push({
      id: 'fb-tv-1',
      type: 'single_choice',
      difficulty: 'DỄ',
      subject: 'Tiếng Việt',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Luyện từ và câu',
      question: `[Tiếng Việt - Kết nối tri thức] Từ nào sau đây là từ láy diễn tả sự chăm chỉ, cần mẫn trong học tập?`,
      options: ['Chăm chỉ', 'Học hành', 'Sách vở', 'Trường lớp'],
      correctOptionIndices: [0],
      explanation: '"Chăm chỉ" là từ láy âm đầu (ch - ch), diễn tả đức tính siêng năng chịu khó.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-tv-2',
      type: 'multiple_choice',
      difficulty: 'TRUNG BÌNH',
      subject: 'Tiếng Việt',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Biện pháp tu từ & Mở rộng vốn từ',
      question: `[Tiếng Việt - Kết nối tri thức] Trong các câu thơ sau, chọn ĐÚNG 2 câu có sử dụng biện pháp so sánh:`,
      options: [
        'Trẻ em như búp trên cành',
        'Mặt trời gác núi, bóng tối lan nhanh',
        'Công cha như núi Thái Sơn',
        'Gió mùa thu xào xạc lá rơi'
      ],
      correctOptionIndices: [0, 2],
      explanation: 'Câu A và C có từ so sánh "như" đối chiếu rõ ràng hai vế tương đồng.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-tv-3',
      type: 'true_false',
      difficulty: 'DỄ',
      subject: 'Tiếng Việt',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Quy tắc chính tả',
      question: `[Tiếng Việt - Kết nối tri thức] Đánh giá tính Đúng / Sai của quy tắc chính tả sau:`,
      statement: 'Trước các nguyên âm e, ê, i, chúng ta phải viết bằng con chữ "k", "gh", "ngh" thay vì "c", "g", "ng".',
      isTrue: true,
      explanation: 'Đúng hoàn toàn theo luật chính tả tiếng Việt hiện hành.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-tv-4',
      type: 'matching',
      difficulty: 'TRUNG BÌNH',
      subject: 'Tiếng Việt',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Thành ngữ & Tục ngữ Việt Nam',
      question: `[Tiếng Việt - Kết nối tri thức] Nối vế đầu ở Cột A với vế kết thúc phù hợp ở Cột B để tạo thành câu tục ngữ hoàn chỉnh:`,
      matchingPairs: [
        { id: 't1', left: 'Uống nước', right: 'Nhớ nguồn' },
        { id: 't2', left: 'Ăn quả', right: 'Nhớ kẻ trồng cây' },
        { id: 't3', left: 'Học thầy không tày', right: 'Học bạn' },
        { id: 't4', left: 'Gần mực thì đen', right: 'Gần đèn thì rạng' },
      ],
      explanation: 'Các câu tục ngữ truyền thống răn dạy đạo lý biết ơn và tinh thần hiếu học.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-tv-5',
      type: 'essay',
      difficulty: 'TRUNG BÌNH',
      subject: 'Tiếng Việt',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Cảm thụ văn học & Tập làm văn',
      question: `[Tiếng Việt - Kết nối tri thức] Em hãy đặt một câu có sử dụng biện pháp nhân hóa để miêu tả vẻ đẹp của một đồ dùng học tập hoặc cây bàng trên sân trường?`,
      sampleAnswer: 'Ví dụ: "Bác bàng già đứng trầm ngâm che chiếc ô xanh mát rượi cho chúng em vui đùa."',
      scoringCriteria: 'Câu đúng ngữ pháp, sử dụng từ ngữ gọi hoặc tả sự vật như người (bác, trầm ngâm, che chở...).',
      explanation: 'Biện pháp nhân hóa giúp sự vật vô tri trở nên sinh động, gần gũi như con người.',
      rewardCoins: coins,
    });
  }
  // Tiếng Anh (English - Global Success)
  else if (subject.toLowerCase().includes('anh') || subject.toLowerCase().includes('english')) {
    pool.push({
      id: 'fb-eng-1',
      type: 'single_choice',
      difficulty: 'DỄ',
      subject: 'Tiếng Anh',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Vocabulary & Daily Communication',
      question: `[English - Global Success] Choose the word that does NOT belong to the group: Apple, Banana, Dog, Orange?`,
      options: ['Apple', 'Banana', 'Dog', 'Orange'],
      correctOptionIndices: [2],
      explanation: 'Dog is an animal (động vật), whereas Apple, Banana, and Orange are fruits (hoa quả).',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-eng-2',
      type: 'multiple_choice',
      difficulty: 'TRUNG BÌNH',
      subject: 'Tiếng Anh',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'School Subjects & Adjectives',
      question: `[English - Global Success] Which TWO of the following words are positive adjectives describing a good student?`,
      options: ['Hardworking', 'Lazy', 'Helpful', 'Careless'],
      correctOptionIndices: [0, 2],
      explanation: 'Hardworking (chăm chỉ) and Helpful (hay giúp đỡ) are positive qualities of a good student.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-eng-3',
      type: 'true_false',
      difficulty: 'DỄ',
      subject: 'Tiếng Anh',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Grammar Basics',
      question: `[English - Global Success] True or False:`,
      statement: 'The plural form of "child" is "childrens".',
      isTrue: false,
      explanation: 'False! The correct plural form is "children" (without the extra "s").',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-eng-4',
      type: 'matching',
      difficulty: 'TRUNG BÌNH',
      subject: 'Tiếng Anh',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Opposite Words (Từ trái nghĩa)',
      question: `[English - Global Success] Match each word in Column A with its opposite word in Column B:`,
      matchingPairs: [
        { id: 'e1', left: 'Hot', right: 'Cold' },
        { id: 'e2', left: 'Big', right: 'Small' },
        { id: 'e3', left: 'Fast', right: 'Slow' },
        { id: 'e4', left: 'Happy', right: 'Sad' },
      ],
      explanation: 'Pairs of opposite adjectives: Hot - Cold, Big - Small, Fast - Slow, Happy - Sad.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-eng-5',
      type: 'essay',
      difficulty: 'TRUNG BÌNH',
      subject: 'Tiếng Anh',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Short Sentence Production',
      question: `[English - Global Success] Answer the question in one complete sentence: "What subject do you like best and why?"`,
      sampleAnswer: 'Example: "I like English best because it is very fun and helps me talk to foreign friends."',
      scoringCriteria: 'Câu trả lời đúng ngữ pháp tiếng Anh, có nêu tên môn học và lí do ngắn gọn.',
      explanation: 'Khuyến khích học sinh tự tin diễn đạt bằng câu trọn vẹn trong tiếng Anh.',
      rewardCoins: coins,
    });
  }
  // Khoa học / Tự nhiên & Xã hội
  else if (subject.toLowerCase().includes('khoa học') || subject.toLowerCase().includes('tự nhiên')) {
    pool.push({
      id: 'fb-sci-1',
      type: 'single_choice',
      difficulty: 'DỄ',
      subject: 'Khoa học',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Thực vật & Môi trường sống',
      question: `[Khoa học - Kết nối tri thức] Ban ngày dưới ánh nắng mặt trời, lá cây quang hợp thải ra khí gì cần thiết cho con người và động vật hô hấp?`,
      options: ['Khí Oxy (O2)', 'Khí Cacbonic (CO2)', 'Khí Nitơ', 'Khí Mê-tan'],
      correctOptionIndices: [0],
      explanation: 'Lá cây hấp thụ khí CO2 và nhả ra khí Oxy trong lành nuôi dưỡng sự sống trên Trái Đất.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-sci-2',
      type: 'multiple_choice',
      difficulty: 'TRUNG BÌNH',
      subject: 'Khoa học',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Năng lượng sạch & Bảo vệ môi trường',
      question: `[Khoa học - Kết nối tri thức] Trong các nguồn năng lượng sau, hãy chọn ĐÚNG 2 nguồn năng lượng tái tạo, thân thiện với môi trường:`,
      options: ['Năng lượng mặt trời', 'Năng lượng than đá', 'Năng lượng gió', 'Năng lượng dầu mỏ'],
      correctOptionIndices: [0, 2],
      explanation: 'Năng lượng mặt trời và năng lượng gió là tài nguyên tái tạo vô tận, không phát thải khí nhà kính.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-sci-3',
      type: 'true_false',
      difficulty: 'DỄ',
      subject: 'Khoa học',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Nước & Sự chuyển thể',
      question: `[Khoa học - Kết nối tri thức] Đánh giá tính Đúng / Sai:`,
      statement: 'Nước chỉ tồn tại ở một thể duy nhất là thể lỏng.',
      isTrue: false,
      explanation: 'Sai! Nước tồn tại ở 3 thể: thể lỏng (nước), thể rắn (băng/đá) và thể khí (hơi nước).',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-sci-4',
      type: 'matching',
      difficulty: 'TRUNG BÌNH',
      subject: 'Khoa học',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Cơ thể người & Sức khỏe',
      question: `[Khoa học - Kết nối tri thức] Nối từng cơ quan ở Cột A với chức năng chính tương ứng ở Cột B:`,
      matchingPairs: [
        { id: 's1', left: 'Trái tim', right: 'Bơm và tuần hoàn máu đi khắp cơ thể' },
        { id: 's2', left: 'Phổi', right: 'Trao đổi khí Oxy và Cacbonic' },
        { id: 's3', left: 'Dạ dày', right: 'Nhào trộn và tiêu hóa thức ăn' },
        { id: 's4', left: 'Bộ não', right: 'Điều khiển mọi hoạt động và suy nghĩ' },
      ],
      explanation: 'Các cơ quan phối hợp nhịp nhàng duy trì sự sống khỏe mạnh của cơ thể con người.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-sci-5',
      type: 'essay',
      difficulty: 'TRUNG BÌNH',
      subject: 'Khoa học',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Bảo vệ nguồn nước & Môi trường',
      question: `[Khoa học - Kết nối tri thức] Nêu ít nhất 2 việc làm cụ thể của học sinh tại trường học để tiết kiệm nước và giữ vệ sinh nguồn nước sạch?`,
      sampleAnswer: '1. Khóa vòi nước ngay sau khi rửa tay; 2. Không vứt rác, xả chất bẩn vào bồn rửa hoặc nguồn nước; 3. Báo với thầy cô khi thấy vòi nước bị rò rỉ.',
      scoringCriteria: 'Nêu được từ 2 hành động cụ thể, thiết thực và đúng với lứa tuổi học sinh.',
      explanation: 'Mỗi hành động nhỏ đều góp phần bảo vệ hành tinh xanh của chúng ta.',
      rewardCoins: coins,
    });
  } 
  // Lịch sử - Địa lí / Đạo đức / Chung
  else {
    pool.push({
      id: 'fb-gen-1',
      type: 'single_choice',
      difficulty: 'DỄ',
      subject: subject || 'Lịch sử & Địa lí',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Đất nước & Con người Việt Nam',
      question: `[Lịch sử & Địa lí - Kết nối tri thức] Thủ đô của nước Cộng hòa Xã hội Chủ nghĩa Việt Nam là thành phố nào?`,
      options: ['Thành phố Hà Nội', 'Thành phố Hồ Chí Minh', 'Thành phố Đà Nẵng', 'Thành phố Hải Phòng'],
      correctOptionIndices: [0],
      explanation: 'Thủ đô Hà Nội là trái tim ngàn năm văn hiến của cả nước.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-gen-2',
      type: 'multiple_choice',
      difficulty: 'TRUNG BÌNH',
      subject: subject || 'Đạo đức & Kỹ năng sống',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Lớp học hạnh phúc & Văn hóa ứng xử',
      question: `[Đạo đức - Kết nối tri thức] Hãy chọn ĐÚNG 2 hành động thể hiện tình bạn đẹp và tinh thần "Lớp Học Hạnh Phúc":`,
      options: [
        'Chủ động giảng bài cho bạn khi bạn chưa hiểu',
        'Che giấu khuyết điểm và bao che khi bạn mắc lỗi vi phạm',
        'Động viên và an ủi khi thấy bạn có chuyện buồn',
        'Nói xấu bạn sau lưng để được người khác chú ý'
      ],
      correctOptionIndices: [0, 2],
      explanation: 'Sự chia sẻ, đồng hành và giúp đỡ bạn tiến bộ là cốt lõi của tình bạn chân chính.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-gen-3',
      type: 'true_false',
      difficulty: 'DỄ',
      subject: subject || 'Lịch sử',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Chiến thắng Bạch Đằng lịch sử',
      question: `[Lịch sử - Kết nối tri thức] Đánh giá nhận định lịch sử sau:`,
      statement: 'Ngô Quyền đã lãnh đạo nhân dân đánh tan quân Nam Hán trên sông Bạch Đằng vào năm 938 bằng kế cắm cọc gỗ.',
      isTrue: true,
      explanation: 'Đúng! Chiến thắng Bạch Đằng năm 938 đã chấm dứt hơn 1000 năm Bắc thuộc, mở ra kỷ nguyên độc lập tự chủ.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-gen-4',
      type: 'matching',
      difficulty: 'TRUNG BÌNH',
      subject: subject || 'Địa lí',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Địa danh & Thắng cảnh đất nước',
      question: `[Địa lí - Kết nối tri thức] Nối danh lam thắng cảnh ở Cột A với tỉnh/thành phố tương ứng ở Cột B:`,
      matchingPairs: [
        { id: 'g1', left: 'Vịnh Hạ Long', right: 'Tỉnh Quảng Ninh' },
        { id: 'g2', left: 'Hồ Hoàn Kiếm (Hồ Gươm)', right: 'Thủ đô Hà Nội' },
        { id: 'g3', left: 'Phố cổ Hội An', right: 'Tỉnh Quảng Nam' },
        { id: 'g4', left: 'Động Phong Nha', right: 'Tỉnh Quảng Bình' },
      ],
      explanation: 'Các danh lam thắng cảnh nổi tiếng là di sản quý giá của đất nước Việt Nam.',
      rewardCoins: coins,
    });

    pool.push({
      id: 'fb-gen-5',
      type: 'essay',
      difficulty: 'KHÓ',
      subject: subject || 'Hoạt động trải nghiệm',
      grade,
      curriculum: 'Kết nối tri thức với cuộc sống',
      topic: topic || 'Lòng biết ơn & Trách nhiệm',
      question: `[Hoạt động trải nghiệm - Kết nối tri thức] Em sẽ làm gì cụ thể mỗi ngày để thể hiện lòng biết ơn sâu sắc đối với cha mẹ và thầy cô giáo của mình?`,
      sampleAnswer: '1. Chăm chỉ học tập, ngoan ngoãn vâng lời; 2. Tự giác giúp đỡ bố mẹ việc nhà phù hợp; 3. Lễ phép chào hỏi, chú ý nghe thầy cô giảng bài.',
      scoringCriteria: 'Trả lời chân thành, có ít nhất 2 việc làm cụ thể phản ánh lòng hiếu thảo và tôn sư trọng đạo.',
      explanation: 'Lòng biết ơn được thể hiện qua những hành động chân thành, thiết thực mỗi ngày.',
      rewardCoins: coins,
    });
  }

  // Filter by requested question type if not 'all'
  let filtered = pool;
  if (questionType && questionType !== 'all') {
    const matched = pool.filter(q => q.type === questionType);
    if (matched.length > 0) {
      filtered = matched;
    }
  }

  // Shuffle pool to ensure fresh order on every generation
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);

  // Repeat or slice to match target count
  const result: QuizQuestion[] = [];
  let idx = 0;
  const timestamp = Date.now();
  while (result.length < Math.min(questionCount, 15)) {
    const item = shuffled[idx % shuffled.length];
    const uniqueSalt = Math.random().toString(36).substring(2, 6);
    
    // Dynamic topic adoption
    const customTopic = topic?.trim() ? topic.trim() : item.topic;
    let customQuestion = item.question;
    if (topicDescription?.trim() && !item.question.includes(topicDescription.trim())) {
      customQuestion = `[${customTopic}] ${item.question.replace(/^\[.*?\]\s*/, '')}`;
    }

    const isMatching = item.type === 'matching' && !!item.matchingPairs && item.matchingPairs.length > 0;
    const shuffledRightOptions = isMatching ? shuffleMatchingRight(item.matchingPairs!) : undefined;

    result.push({
      ...item,
      id: `${item.id}-${timestamp}-${result.length + 1}-${uniqueSalt}`,
      topic: customTopic,
      question: customQuestion,
      difficulty: difficulty || item.difficulty,
      shuffledRightOptions,
      rewardCoins: coins,
    });
    idx++;
  }

  return result;
}

// Generate smart Warm-up Quiz with AI according to "Kết nối tri thức với cuộc sống"
export async function generateKetNoiTriThucQuiz(config: QuizGenerationConfig): Promise<QuizQuestion[]> {
  const { 
    questionCount, 
    subject, 
    grade, 
    curriculum, 
    semester, 
    topic, 
    topicDescription, 
    questionType, 
    difficulty, 
    rewardCoins 
  } = config;

  const prompt = `Bạn là chuyên gia giáo dục và tác giả chương trình sách giáo khoa "${curriculum || 'Bộ sách Kết nối tri thức với cuộc sống'}" tại Việt Nam.
Nhiệm vụ: Hãy tạo bộ ${questionCount} câu hỏi khởi động & đố vui đầu giờ (Warm-up game) sinh động, tạo tiếng cười hào hứng và kích thích tư duy cho học sinh.

YÊU CẦU NỘI DUNG VÀ SƯ PHẠM:
- Sách giáo khoa: ${curriculum || 'Kết nối tri thức với cuộc sống'}.
- Môn học: ${subject}.
- Khối lớp: ${grade}.
- Học kỳ: ${semester}.
- Chủ đề bài học: ${topic ? topic : 'Chủ đề trọng tâm theo phân phối chương trình môn học'}.
- Mô tả chi tiết chủ đề: ${topicDescription ? topicDescription : 'Khởi động vui vẻ, kích hoạt hứng thú học tập và tư duy tích cực'}.
- Mức độ nhận thức: ${difficulty} (DỄ: nhận biết, hào hứng; TRUNG BÌNH: thông hiểu, suy luận; KHÓ: tư duy logic, thử thách).
- Yêu cầu dạng câu hỏi: ${questionType === 'all' ? 'Đa dạng kết hợp cả 5 dạng: 1. Trắc nghiệm 4 đáp án 1 đáp án đúng, 2. Trắc nghiệm 4 đáp án 2 đáp án đúng, 3. Đúng/Sai, 4. Nối cặp, 5. Tự luận' : `Tập trung vào dạng: ${questionType}`}.
- ĐẶC BIỆT VỚI CÂU HỎI NỐI CỘT (matching): Tạo 3 đến 4 cặp đối sánh Cột A và Cột B chuẩn kiến thức bài học. Hệ thống sẽ xáo trộn Cột B tự động để đảm bảo các ý không bị nối ngang hàng.

CẤU TRÚC JSON TRẢ VỀ:
Hãy trả về JSON THUẦN TÚY (mảng Array các câu hỏi) không kèm giải thích ngoài JSON:
[
  {
    "id": "q1",
    "type": "single_choice" | "multiple_choice" | "true_false" | "matching" | "essay",
    "difficulty": "${difficulty}",
    "subject": "${subject}",
    "grade": "${grade}",
    "curriculum": "Kết nối tri thức với cuộc sống",
    "topic": "${topic || 'Khởi động bài học'}",
    "question": "Nội dung câu hỏi ngắn gọn, sư phạm...",
    
    // Nếu là type "single_choice":
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correctOptionIndices": [0],

    // Nếu là type "multiple_choice":
    // "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    // "correctOptionIndices": [0, 2], // đúng 2 đáp án

    // Nếu là type "true_false":
    // "statement": "Nhận định cần đánh giá...",
    // "isTrue": true hoặc false,

    // Nếu là type "matching":
    // "matchingPairs": [
    //    { "id": "m1", "left": "Vế A1", "right": "Vế B1" },
    //    { "id": "m2", "left": "Vế A2", "right": "Vế B2" },
    //    { "id": "m3", "left": "Vế A3", "right": "Vế B3" }
    // ],

    // Nếu là type "essay":
    // "sampleAnswer": "Đáp án mẫu gợi ý cho giáo viên...",
    // "scoringCriteria": "Tiêu chí chấm điểm đúng...",

    "explanation": "Lời giải thích dí dỏm, sâu sắc...",
    "rewardCoins": ${rewardCoins || 5}
  }
]`;

  try {
    const rawResponse = await callGeminiAi({ 
      prompt,
      responseMimeType: 'application/json',
      model: 'gemini-3.1-flash-lite',
    });

    let parsed: any = null;
    // Layer 1: direct parse
    try {
      parsed = JSON.parse(rawResponse.trim());
    } catch {
      // Layer 2: extract code block ```json ... ```
      const blockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (blockMatch) {
        try {
          parsed = JSON.parse(blockMatch[1].trim());
        } catch {}
      }
      // Layer 3: extract JSON array [ ... ]
      if (!parsed) {
        const arrMatch = rawResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrMatch) {
          try {
            parsed = JSON.parse(arrMatch[0].trim());
          } catch {}
        }
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      const timestamp = Date.now();
      // Normalize and sanitize questions
      return parsed.map((item, i) => {
        const uniqueSalt = Math.random().toString(36).substring(2, 6);
        const isMatching = (item.type === 'matching' || (!item.type && Array.isArray(item.matchingPairs))) && Array.isArray(item.matchingPairs) && item.matchingPairs.length > 0;
        const shuffledRightOptions = isMatching ? shuffleMatchingRight(item.matchingPairs) : undefined;

        return {
          id: item.id ? `ai-${item.id}-${timestamp}-${i}-${uniqueSalt}` : `ai-${timestamp}-${i}-${uniqueSalt}`,
          type: item.type || (questionType !== 'all' ? questionType : 'single_choice'),
          difficulty: item.difficulty || difficulty || 'DỄ',
          subject: item.subject || subject,
          grade: item.grade || grade,
          curriculum: 'Kết nối tri thức với cuộc sống',
          topic: item.topic || topic || 'Khởi động',
          question: item.question || `Câu hỏi ${i + 1}`,
          options: item.options || (item.type === 'single_choice' || item.type === 'multiple_choice' ? ['A', 'B', 'C', 'D'] : undefined),
          correctOptionIndices: Array.isArray(item.correctOptionIndices) ? item.correctOptionIndices : [0],
          statement: item.statement,
          isTrue: typeof item.isTrue === 'boolean' ? item.isTrue : true,
          matchingPairs: item.matchingPairs,
          shuffledRightOptions,
          sampleAnswer: item.sampleAnswer,
          scoringCriteria: item.scoringCriteria,
          explanation: item.explanation || 'Đáp án chính xác theo chương trình học.',
          rewardCoins: rewardCoins || 5,
        };
      });
    }
    return generateKetNoiTriThucQuizFallback(config);
  } catch (err) {
    console.warn('Fallback to built-in Ket Noi Tri Thuc quiz pool:', err);
    return generateKetNoiTriThucQuizFallback(config);
  }
}

// Keep legacy fallback for backward compatibility
export function generateSmartWarmupQuizFallback(subject: string, grade: string): Array<{
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}> {
  const list = generateKetNoiTriThucQuizFallback({
    questionCount: 3,
    subject,
    grade,
    curriculum: 'Bộ sách Kết nối tri thức với cuộc sống',
    semester: 'Học kỳ 1',
    topic: 'Khởi động bài học',
    topicDescription: '',
    questionType: 'single_choice',
    difficulty: 'DỄ',
    rewardCoins: 5,
  });

  return list.map(q => ({
    question: q.question,
    options: q.options || ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
    correctIndex: q.correctOptionIndices?.[0] || 0,
    explanation: q.explanation,
  }));
}

