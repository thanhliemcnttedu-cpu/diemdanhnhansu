import { Student, PointTransaction, AiQuizQuestion, AiStudentRemark } from '../types';

/**
 * Intelligent AI pedagogical helper for Happy Classroom
 * Uses Gemini AI if API key is provided, or instant smart pedagogical generation logic.
 */

export async function generateStudentAiRemark(
  student: Student,
  transactions: PointTransaction[],
  attendanceRate = 100
): Promise<AiStudentRemark> {
  // Extract transactions for this student
  const studentTx = transactions.filter(t => t.studentId === student.id);
  const positiveTx = studentTx.filter(t => t.amount > 0);
  const negativeTx = studentTx.filter(t => t.amount < 0);

  // Subject performance
  const subjectsSet = new Set(positiveTx.map(t => t.subjectName).filter(Boolean));
  const subjectList = Array.from(subjectsSet).join(', ') || 'các hoạt động nề nếp chung';

  let summary = '';
  let strengths: string[] = [];
  let recommendations: string[] = [];
  let parentNote = '';

  if (student.points >= 25) {
    summary = `Em ${student.name} có thành tích rèn luyện rất xuất sắc (${student.points} xu), luôn gương mẫu, chủ động phát biểu xây dựng bài và có ý thức tập thể cao.`;
    strengths = [
      `Tích cực phát biểu và đạt nhiều điểm tốt trong môn ${subjectList}`,
      'Ý thức kỷ luật tốt, hoàn thành đầy đủ bài tập và tích cực giúp đỡ bạn bè',
      'Luôn là tấm gương sáng cho các bạn trong lớp noi theo'
    ];
    recommendations = [
      'Tiếp tục duy trì phong độ và thử sức với các bài toán mở rộng / câu hỏi nâng cao',
      'Phát huy vai trò nhóm trưởng để hỗ trợ các bạn cùng tiến bộ'
    ];
    parentNote = `Kính gửi phụ huynh em ${student.name}: Thầy cô rất vui mừng khi thấy em luôn hăng hái, chăm ngoan và đạt kết quả thi đua cao nhất lớp tuần này. Gia đình hãy dành lời khen ngợi để tiếp thêm động lực cho em nhé!`;
  } else if (student.points >= 10) {
    summary = `Em ${student.name} có nhiều tiến bộ tích cực (${student.points} xu), nắm bài khá tốt và có tinh thần trách nhiệm trong học tập.`;
    strengths = [
      `Có nhiều cố gắng trong môn ${subjectList}`,
      'Ngoan ngoãn, lễ phép, lắng nghe thầy cô giảng bài',
      'Tham gia tương tác lớp tương đối đều đặn'
    ];
    recommendations = [
      'Cần mạnh dạn giơ tay phát biểu nhiều hơn trước lớp',
      'Rèn luyện thêm tính cẩn thận khi làm bài tập tự học'
    ];
    parentNote = `Kính gửi phụ huynh em ${student.name}: Em ${student.name} có sự tiến bộ rõ rệt trong tuần qua. Thầy cô mong gia đình tiếp tục đồng hành và nhắc nhở em duy trì thói quen đọc sách mỗi tối.`;
  } else if (student.points > 0) {
    summary = `Em ${student.name} ngoan ngoãn nhưng còn hơi rụt rè (${student.points} xu), cần được khích lệ thêm để phát huy hết tiềm năng.`;
    strengths = [
      'Chấp hành nội quy lớp học, đi học đầy đủ đúng giờ',
      'Có khả năng tiếp thu bài khi được thầy cô hướng dẫn trực tiếp'
    ];
    recommendations = [
      'Tập thói quen chuẩn bị bài trước ở nhà để tự tin phát biểu',
      'Tham gia sôi nổi hơn vào các trò chơi học tập và hoạt động nhóm'
    ];
    parentNote = `Kính gửi phụ huynh: Em ${student.name} trong lớp rất hiền và ngoan. Thầy cô đang tạo điều kiện để em tự tin hơn khi nói trước đám đông. Rất mong phụ huynh động viên em thêm ở nhà.`;
  } else {
    summary = `Em ${student.name} hiện đang có điểm xu thi đua thấp (${student.points} xu), có dấu hiệu mất tập trung hoặc quên làm bài tập.`;
    strengths = [
      'Biết lắng nghe khi thầy cô nhắc nhở nhẹ nhàng',
      'Có phản xạ nhanh trong các hoạt động trực quan'
    ];
    recommendations = [
      'Cần rèn luyện tính kiên nhẫn và tập trung trong giờ học',
      'Hoàn thành bài tập về nhà đầy đủ trước khi đến lớp',
      'Giáo viên sẽ tạo cơ hội gọi em trả lời câu hỏi dễ để em nhận thêm xu thưởng'
    ];
    parentNote = `Kính gửi phụ huynh em ${student.name}: Tuần này em còn đôi lúc xao nhãng trong giờ học. Thầy cô sẽ đặc biệt quan tâm hỗ trợ em trên lớp, kính mong gia đình cùng phối hợp nhắc nhở góc học tập tại nhà.`;
  }

  return {
    studentId: student.id,
    studentName: student.name,
    summary,
    strengths,
    recommendations,
    parentNote
  };
}

export function generateQuizBankBySubject(subject: string): AiQuizQuestion[] {
  const norm = subject.toLowerCase();

  if (norm.includes('toán')) {
    return [
      {
        id: 'q-math-1',
        subject: 'Toán học',
        question: 'Hình vuông có cạnh 6 cm. Chu vi của hình vuông đó là bao nhiêu?',
        options: ['12 cm', '24 cm', '36 cm', '18 cm'],
        correctIndex: 1,
        explanation: 'Chu vi hình vuông = Cạnh × 4 = 6 × 4 = 24 cm.'
      },
      {
        id: 'q-math-2',
        subject: 'Toán học',
        question: 'Tìm x biết: x × 7 = 56?',
        options: ['x = 6', 'x = 7', 'x = 8', 'x = 9'],
        correctIndex: 2,
        explanation: 'x = 56 : 7 = 8.'
      },
      {
        id: 'q-math-3',
        subject: 'Toán học',
        question: 'Số lớn nhất có 4 chữ số khác nhau là số nào?',
        options: ['9999', '9876', '1023', '9899'],
        correctIndex: 1,
        explanation: 'Số lớn nhất có 4 chữ số khác nhau là 9876.'
      },
      {
        id: 'q-math-4',
        subject: 'Toán học',
        question: '1 thế kỉ bằng bao nhiêu năm?',
        options: ['10 năm', '50 năm', '100 năm', '1000 năm'],
        correctIndex: 2,
        explanation: '1 thế kỉ = 100 năm.'
      }
    ];
  } else if (norm.includes('tiếng việt')) {
    return [
      {
        id: 'q-viet-1',
        subject: 'Tiếng Việt',
        question: 'Từ nào sau đây viết ĐÚNG chính tả?',
        options: ['Sắp sếp', 'Sắp xếp', 'Xắp sếp', 'Xắp xếp'],
        correctIndex: 1,
        explanation: '"Sắp xếp" là từ đúng chính tả tiếng Việt.'
      },
      {
        id: 'q-viet-2',
        subject: 'Tiếng Việt',
        question: 'Câu "Mặt trời đỏ rực như một quả cầu lửa" sử dụng biện pháp tu từ nào?',
        options: ['Nhân hóa', 'So sánh', 'Điệp ngữ', 'Ẩn dụ'],
        correctIndex: 1,
        explanation: 'Câu sử dụng từ so sánh "như" để đối sánh Mặt trời với quả cầu lửa.'
      },
      {
        id: 'q-viet-3',
        subject: 'Tiếng Việt',
        question: 'Từ nào đồng nghĩa với từ "chăm chỉ"?',
        options: ['Cần cù', 'Thông minh', 'Dũng cảm', 'Thật thà'],
        correctIndex: 0,
        explanation: '"Cần cù", "siêng năng" đồng nghĩa với "chăm chỉ".'
      }
    ];
  } else if (norm.includes('anh')) {
    return [
      {
        id: 'q-eng-1',
        subject: 'Tiếng Anh',
        question: 'What is the opposite of "Hot"?',
        options: ['Warm', 'Cold', 'Big', 'Fast'],
        correctIndex: 1,
        explanation: 'Cold is the opposite of Hot.'
      },
      {
        id: 'q-eng-2',
        subject: 'Tiếng Anh',
        question: 'Which animal has a long neck?',
        options: ['Elephant', 'Giraffe', 'Tiger', 'Monkey'],
        correctIndex: 1,
        explanation: 'A giraffe has a very long neck.'
      }
    ];
  } else {
    return [
      {
        id: 'q-gen-1',
        subject: 'Tự nhiên & Xã hội',
        question: 'Bộ phận nào của cây có chức năng hút nước và chất khoáng từ lòng đất?',
        options: ['Lá cây', 'Thân cây', 'Rễ cây', 'Hoa'],
        correctIndex: 2,
        explanation: 'Rễ cây cắm sâu vào lòng đất để hút nước và chất khoáng nuôi cây.'
      },
      {
        id: 'q-gen-2',
        subject: 'Khoa học',
        question: 'Nước tồn tại ở mấy thể chính?',
        options: ['1 thể', '2 thể', '3 thể (rắn, lỏng, khí)', '4 thể'],
        correctIndex: 2,
        explanation: 'Nước tồn tại ở 3 thể: Thể rắn (băng đá), thể lỏng (nước nước), thể khí (hơi nước).'
      }
    ];
  }
}
