import type { PuzzleSet } from '../../../../services/puzzleStore';

/** Bộ mẫu có sẵn để thầy cô chơi thử ngay (ảnh vẽ bằng SVG, không cần tệp ngoài). Không lưu vào kho cá nhân. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DD3FC"/><stop offset="1" stop-color="#E0F2FE"/></linearGradient>
<linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ADE80"/><stop offset="1" stop-color="#16A34A"/></linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#sky)"/>
<circle cx="1110" cy="120" r="70" fill="#FDE047"/><circle cx="1110" cy="120" r="95" fill="#FDE047" opacity=".25"/>
<g fill="none" stroke-width="26" stroke-linecap="round">
<path d="M170 560 A470 470 0 0 1 1110 560" stroke="#EF4444"/>
<path d="M200 560 A440 440 0 0 1 1080 560" stroke="#F97316"/>
<path d="M230 560 A410 410 0 0 1 1050 560" stroke="#FACC15"/>
<path d="M260 560 A380 380 0 0 1 1020 560" stroke="#22C55E"/>
<path d="M290 560 A350 350 0 0 1 990 560" stroke="#3B82F6"/>
<path d="M320 560 A320 320 0 0 1 960 560" stroke="#6366F1"/>
<path d="M350 560 A290 290 0 0 1 930 560" stroke="#A855F7"/>
</g>
<g fill="#fff"><ellipse cx="210" cy="170" rx="110" ry="46"/><ellipse cx="290" cy="150" rx="80" ry="44"/><ellipse cx="930" cy="260" rx="100" ry="40"/><ellipse cx="1010" cy="245" rx="70" ry="38"/></g>
<ellipse cx="640" cy="760" rx="820" ry="240" fill="url(#hill)"/>
<ellipse cx="180" cy="720" rx="360" ry="150" fill="#22C55E"/>
<ellipse cx="1120" cy="730" rx="380" ry="170" fill="#22C55E"/>
<rect x="520" y="400" width="240" height="190" fill="#FEF3C7" stroke="#B45309" stroke-width="8"/>
<polygon points="490,405 640,290 790,405" fill="#DC2626" stroke="#7F1D1D" stroke-width="8" stroke-linejoin="round"/>
<rect x="615" y="480" width="60" height="110" fill="#92400E"/>
<rect x="545" y="445" width="55" height="55" fill="#7DD3FC" stroke="#B45309" stroke-width="6"/>
<rect x="690" y="445" width="55" height="55" fill="#7DD3FC" stroke="#B45309" stroke-width="6"/>
<rect x="705" y="320" width="34" height="70" fill="#B45309"/>
<g><rect x="190" y="470" width="26" height="110" fill="#92400E"/><circle cx="203" cy="450" r="75" fill="#15803D"/><circle cx="160" cy="480" r="55" fill="#16A34A"/><circle cx="250" cy="485" r="55" fill="#16A34A"/></g>
<g><rect x="1040" y="480" width="24" height="100" fill="#92400E"/><circle cx="1052" cy="460" r="68" fill="#15803D"/><circle cx="1010" cy="488" r="50" fill="#16A34A"/><circle cx="1096" cy="490" r="50" fill="#16A34A"/></g>
<g fill="#F472B6"><circle cx="380" cy="640" r="12"/><circle cx="440" cy="660" r="12"/><circle cx="860" cy="650" r="12"/><circle cx="920" cy="670" r="12"/></g>
</svg>`;

export const SAMPLE_PUZZLE: PuzzleSet = {
  id: 'pz-sample',
  title: 'Bộ mẫu: Khám phá bức tranh bí mật',
  description: 'Câu hỏi vui cho lớp 1–3. Thầy cô có thể soạn bộ của riêng mình.',
  pieces: 6,
  mode: 'retry',
  image: `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`,
  answer: 'Ngôi nhà cầu vồng; Nhà cầu vồng; Cầu vồng; Ngôi nhà',
  updatedAt: 0,
  questions: [
    { id: 'q1', text: '5 + 7 = ?', options: ['11', '12', '13', '10'], correct: 1 },
    { id: 'q2', text: 'Thủ đô của nước Việt Nam là thành phố nào?', options: ['Huế', 'Đà Nẵng', 'Hà Nội', 'Cần Thơ'], correct: 2 },
    { id: 'q3', text: 'Mặt trời mọc ở hướng nào?', options: ['Đông', 'Tây', 'Nam', 'Bắc'], correct: 0 },
    { id: 'q4', text: 'Cầu vồng thường có mấy màu?', options: ['5', '6', '8', '7'], correct: 3 },
    { id: 'q5', text: 'Con vật nào dưới đây biết bay?', options: ['Con chó', 'Con chim', 'Con cá', 'Con mèo'], correct: 1 },
    { id: 'q6', text: 'Số liền sau của 99 là số nào?', options: ['98', '101', '100', '90'], correct: 2, explanation: '99 thêm 1 bằng 100.' },
  ],
};
