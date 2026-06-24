/** 首頁課次圖塊分組（可再加二年級上等） */
export const LESSON_BOOKS = [
  {
    id: "g1-2",
    label: "一年級下",
    hint: "國語 1～12 課",
    match: (lesson) => {
      const n = parseZhLessonNum(lesson);
      return n !== null && n >= 1 && n <= 12;
    },
    sortKey: (lesson) => parseZhLessonNum(lesson) || 0,
    chipLabel: (lesson) => String(parseZhLessonNum(lesson)),
  },
  // 二上題庫就緒後可取消註解：
  // {
  //   id: "g2-1",
  //   label: "二年級上",
  //   hint: "國語",
  //   match: (lesson) => { ... },
  // },
];

const CN_DIGIT = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** @param {string} lesson */
export function parseZhLessonNum(lesson) {
  const m = String(lesson).match(/^第([一二三四五六七八九十]+)課/);
  if (!m) return null;
  const raw = m[1];
  if (raw === "十") return 10;
  if (raw === "十一") return 11;
  if (raw === "十二") return 12;
  if (raw.startsWith("十") && raw.length === 2) return 10 + (CN_DIGIT[raw[1]] || 0);
  return CN_DIGIT[raw] ?? null;
}

/** @param {string} lesson */
export function formatLessonCurrent(lesson) {
  if (lesson === "全部") return "全部課次";
  const n = parseZhLessonNum(lesson);
  if (n) return `第 ${n} 課`;
  const s = String(lesson);
  return s.length > 10 ? `${s.slice(0, 10)}…` : s;
}

/**
 * @param {string[]} lessons 含「全部」
 */
export function groupLessonsForBooks(lessons) {
  const rest = lessons.filter((l) => l !== "全部");
  const books = LESSON_BOOKS.map((book) => ({
    ...book,
    lessons: rest.filter(book.match).sort((a, b) => book.sortKey(a) - book.sortKey(b)),
  })).filter((b) => b.lessons.length > 0);

  const matched = new Set(books.flatMap((b) => b.lessons));
  const ungrouped = rest.filter((l) => !matched.has(l)).sort();

  return { books, ungrouped };
}
