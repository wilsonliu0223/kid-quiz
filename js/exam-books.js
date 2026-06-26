/** 試算表課次欄正規化（舊名、多餘空白） */
export function normalizeEnLesson(lesson) {
  const s = String(lesson ?? "").trim().replace(/\s+/g, " ");
  if (s === "Unit21考試" || s === "TJ3") return "TJ3 Unit21考試";
  return s;
}

/** 英語考試範圍分組（試算表「課次」欄，例：TJ3 Unit21考試） */
export const EN_EXAM_BOOKS = [
  {
    id: "tj3",
    label: "TJ3",
    hint: "三年級",
    match: (lesson) => /^TJ3(\s|$)/i.test(lesson) || lesson === "Unit21考試", // 舊課次名相容
    sortKey: (lesson) => lesson,
    chipLabel: (lesson) => String(lesson),
  },
  {
    id: "tj4",
    label: "TJ4",
    hint: "四年級",
    match: (lesson) => /^TJ4(\s|$)/i.test(lesson),
    sortKey: (lesson) => lesson,
    chipLabel: (lesson) => String(lesson),
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
 * 試算表若同時有舊名 Unit21考試 與 TJ3 Unit21考試，選單只留後者。
 * @param {string[]} lessons 含「全部」
 */
export function dedupeEnExamLessons(lessons) {
  const rest = lessons.filter((l) => l !== "全部");
  const hasTj3Prefixed = rest.some((l) => /^TJ3\s+/i.test(l));
  const filtered = hasTj3Prefixed
    ? rest.filter((l) => l !== "Unit21考試")
    : rest;
  return lessons.includes("全部") ? ["全部", ...filtered] : filtered;
}

/** 選 TJ3 Unit21考試 時，一併納入舊課次名的題目 */
export function enLessonFilterAliases(lesson) {
  if (lesson === "TJ3 Unit21考試") return ["TJ3 Unit21考試", "Unit21考試"];
  return [lesson];
}

/**
 * @param {string[]} lessons 含「全部」
 */
export function groupLessonsForEnExams(lessons) {
  const normalized = dedupeEnExamLessons(lessons);
  const rest = normalized.filter((l) => l !== "全部");
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
