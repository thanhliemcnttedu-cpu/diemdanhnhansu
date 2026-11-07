/**
 * Guess student gender from Vietnamese full name
 */
export function guessVietnameseGender(fullName: string): 'Nam' | 'Nữ' {
  const clean = fullName.trim().toLowerCase();
  const words = clean.split(/\s+/);
  
  if (words.length === 0) return 'Nam';

  // Explicit check for traditional middle names
  if (words.includes('thị') || words.includes('thi')) return 'Nữ';
  if (words.includes('văn') || words.includes('van')) return 'Nam';

  // Check last word (given name)
  const lastName = words[words.length - 1];

  const femaleNames = new Set([
    'mai', 'lan', 'cúc', 'trúc', 'hoa', 'hương', 'ngọc', 'vy', 'thảo', 'linh', 
    'phương', 'hằng', 'trang', 'nhi', 'quỳnh', 'chi', 'thùy', 'như', 'diệp', 
    'thư', 'trâm', 'ngân', 'uyên', 'my', 'yến', 'hà', 'thu', 'nga', 'tuyết', 
    'liên', 'hạnh', 'dung', 'loan', 'thanh', 'bích', 'hiền', 'châu', 'trang',
    'phượng', 'vân', 'hồng', 'anh', 'tâm', 'an'
  ]);

  const maleNames = new Set([
    'văn', 'đức', 'minh', 'tuấn', 'hoàng', 'hải', 'dũng', 'huy', 'sơn', 'khoa',
    'hùng', 'long', 'nam', 'quân', 'thắng', 'toàn', 'bách', 'cường', 'kiên',
    'phong', 'lâm', 'trọng', 'duy', 'việt', 'đạt', 'tùng', 'thái', 'trí', 'nguyên',
    'khánh', 'bảo', 'phúc', 'quang', 'tiến', 'bình', 'thành', 'nghĩa', 'trung'
  ]);

  if (femaleNames.has(lastName)) return 'Nữ';
  if (maleNames.has(lastName)) return 'Nam';

  // Middle name checks
  if (words.length >= 2) {
    const middleName = words[words.length - 2];
    if (femaleNames.has(middleName)) return 'Nữ';
    if (maleNames.has(middleName)) return 'Nam';
  }

  return 'Nam';
}

/**
 * Clean and parse bulk pasted student list
 * Handles formats like:
 * 1. Nguyễn Văn An
 * 2. Trần Thị Bình - Nữ
 * 3. Lê Hoàng Cúc
 * or tab-separated Excel exports
 */
export interface ParsedStudentItem {
  stt: number;
  name: string;
  gender: 'Nam' | 'Nữ';
}

export function parseBulkStudentInput(rawText: string, autoGuessGender = true, defaultGender: 'Nam' | 'Nữ' = 'Nam'): ParsedStudentItem[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result: ParsedStudentItem[] = [];

  lines.forEach((line, index) => {
    // Strip leading number like "1.", "1 -", "1/", "[1]"
    let cleanLine = line.replace(/^\s*[\(\[]?\d+[\)\]\.\-\:\/]?\s*/, '').trim();

    let gender: 'Nam' | 'Nữ' = defaultGender;

    // Check if line contains explicit gender tab or hyphen, e.g. "Nguyễn Thị Hoa \t Nữ" or "Nguyễn Thị Hoa - Nữ"
    const matchExplicit = cleanLine.match(/^(.*?)(?:[\t,\|\-–—]+|\s{2,})(nam|nữ|nu|boy|girl|m|f)$/i);
    if (matchExplicit) {
      cleanLine = matchExplicit[1].trim();
      const gStr = matchExplicit[2].toLowerCase();
      gender = (gStr === 'nữ' || gStr === 'nu' || gStr === 'girl' || gStr === 'f') ? 'Nữ' : 'Nam';
    } else if (autoGuessGender) {
      gender = guessVietnameseGender(cleanLine);
    }

    if (cleanLine.length > 0) {
      result.push({
        stt: index + 1,
        name: cleanLine,
        gender
      });
    }
  });

  return result;
}
