// =====================================================
// Chuẩn hóa kỳ hạn từ nhiều nguồn về 9 bucket báo cáo
// =====================================================

export const VALID_TERMS = ['KKH', '1M', '3M', '6M', '9M', '12M', '18M', '24M', '36M'] as const;

export type TermCode = typeof VALID_TERMS[number];

export const TERM_DISPLAY: Record<string, string> = {
  'KKH': 'KKH',
  '1M': '1 tháng',
  '3M': '3 tháng',
  '6M': '6 tháng',
  '9M': '9 tháng',
  '12M': '12 tháng',
  '18M': '18 tháng',
  '24M': '24 tháng',
  '36M': '36 tháng',
};

export const TERM_SHORT: Record<string, string> = {
  'KKH': 'KKH',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '9M': '9M',
  '12M': '12M',
  '18M': '18M',
  '24M': '24M',
  '36M': '36M',
};

// Bảng mapping đầy đủ: input (lowercase) => bucket chuẩn
const TERM_MAP: Record<string, TermCode> = {
  // KKH
  '0t': 'KKH',
  'kkh': 'KKH',
  'không kỳ hạn': 'KKH',
  'khong ky han': 'KKH',
  'demand': 'KKH',

  // 1M
  '1t': '1M',
  '01t': '1M',
  '1 tháng': '1M',
  '01 tháng': '1M',
  '1 thang': '1M',
  '01 thang': '1M',
  'dưới 1 tháng': '1M',
  'duoi 1 thang': '1M',

  // 2M => gom vào 1M
  '2t': '1M',
  '02t': '1M',
  '2 tháng': '1M',
  '02 tháng': '1M',
  '2 thang': '1M',
  '02 thang': '1M',

  // 3M
  '3t': '3M',
  '03t': '3M',
  '3 tháng': '3M',
  '03 tháng': '3M',
  '3 thang': '3M',
  '03 thang': '3M',
  'từ 1 đến dưới 3 tháng': '3M',

  // 6M
  '6t': '6M',
  '06t': '6M',
  '6 tháng': '6M',
  '06 tháng': '6M',
  '6 thang': '6M',
  '06 thang': '6M',
  'từ 3 đến dưới 6 tháng': '6M',

  // 9M
  '9t': '9M',
  '09t': '9M',
  '9 tháng': '9M',
  '09 tháng': '9M',
  '9 thang': '9M',
  '09 thang': '9M',

  // 12M
  '12t': '12M',
  '12 tháng': '12M',
  '12 thang': '12M',
  '1 năm': '12M',
  '1 nam': '12M',

  // 13M, 15M => gom vào 12M
  '13t': '12M',
  '13 tháng': '12M',
  '13 thang': '12M',
  '15t': '12M',
  '15 tháng': '12M',
  '15 thang': '12M',

  // 18M
  '18t': '18M',
  '18 tháng': '18M',
  '18 thang': '18M',
  '1.5 năm': '18M',

  // 24M
  '24t': '24M',
  '24 tháng': '24M',
  '24 thang': '24M',
  '2 năm': '24M',
  '2 nam': '24M',

  // 36M
  '36t': '36M',
  '36 tháng': '36M',
  '36 thang': '36M',
  '3 năm': '36M',
  '3 nam': '36M',
  '36+ tháng': '36M',
  'trên 36 tháng': '36M',
  'tren 36 thang': '36M',
};

/**
 * Map một chuỗi kỳ hạn bất kỳ về bucket chuẩn
 * @param input - chuỗi kỳ hạn (VD: "12T", "12 tháng", "1 năm")
 * @returns TermCode hoặc null nếu không map được
 */
export function mapTermCode(input: string): TermCode | null {
  if (!input) return null;

  const cleaned = input.toLowerCase().trim().replace(/\s+/g, ' ');

  // Thử exact match trước
  if (TERM_MAP[cleaned]) return TERM_MAP[cleaned];

  // Thử match từng key
  for (const [key, code] of Object.entries(TERM_MAP)) {
    if (cleaned.includes(key)) return code;
  }

  // Thử parse số + "tháng" hoặc "t"
  const numMatch = cleaned.match(/^(\d+)\s*(tháng|thang|t)$/);
  if (numMatch) {
    const months = parseInt(numMatch[1]);
    const monthMap: Record<number, TermCode> = {
      0: 'KKH', 1: '1M', 2: '1M', 3: '3M', 6: '6M', 9: '9M',
      12: '12M', 13: '12M', 15: '12M', 18: '18M', 24: '24M', 36: '36M',
    };
    return monthMap[months] || null;
  }

  // Nếu input chính là term code chuẩn
  const upper = input.toUpperCase().trim();
  if (VALID_TERMS.includes(upper as TermCode)) return upper as TermCode;

  return null;
}

/**
 * Kiểm tra một term code có hợp lệ không
 */
export function isValidTerm(term: string): term is TermCode {
  return VALID_TERMS.includes(term as TermCode);
}
