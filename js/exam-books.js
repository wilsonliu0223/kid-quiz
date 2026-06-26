/** 英語考試範圍分組（試算表「課次」欄，例：TJ3 Unit21考試） */
export const EN_EXAM_BOOKS = [
  {
    id: "tj3",
    label: "TJ3",
    hint: "三年級",
    match: (lesson) => /^TJ3(\s|$)/i.test(lesson) || lesson === "Unit21考試",
    sortKey: (lesson) => lesson,
    chipLabel: (lesson) => {
      const s = String(lesson).replace(/^TJ3\s*/i, "");
      return s || lesson;
    },
  },
  {
    id: "tj4",
    label: "TJ4",
    hint: "四年級",
    match: (lesson) => /^TJ4(\s|$)/i.test(lesson),
    sortKey: (lesson) => lesson,
    chipLabel: (lesson) => {
      const s = String(lesson).replace(/^TJ4\s*/i, "");
      return s || lesson;
    },
  },
];

/** @param {string} lesson */
export function formatEnExamCurrent(lesson) {
  if (lesson === "全部") return "請選擇考試";
  return String(lesson);
}

/** @param {string} lesson */
export function formatEnExamTitle(lesson) {
  if (lesson === "全部") return "全部範圍";
  return String(lesson);
}

/**
 * @param {string[]} lessons 含「全部」
 */
export function groupLessonsForEnExams(lessons) {
  const rest = lessons.filter((l) => l !== "全部");
  const books = EN_EXAM_BOOKS.map((book) => ({
    ...book,
    lessons: rest.filter(book.match).sort((a, b) => {
      const ka = book.sortKey(a);
      const kb = book.sortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }),
  })).filter((b) => b.lessons.length > 0);

  const matched = new Set(books.flatMap((b) => b.lessons));
  const ungrouped = rest.filter((l) => !matched.has(l)).sort();

  return { books, ungrouped };
}
