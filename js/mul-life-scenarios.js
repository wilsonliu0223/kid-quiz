/**
 * 九九乘法生活情境（約 10 種句型，隨機輪替）
 * @typedef {'product'|'factorA'|'factorB'} MulBlank
 */

/** @type {ReadonlyArray<{ id: string, story: (a:number,b:number,p:number)=>string, product: (a:number,b:number)=>string, factorB: (a:number,p:number)=>string, factorA: (b:number,p:number)=>string }>} */
const LIFE_TEMPLATES = [
  {
    id: "candy",
    story: (a, b, p) => `${a}個人，每個人要有${b}顆糖果，總共有${p}顆`,
    product: (a, b) => `${a}個人，每個人要有${b}顆糖果，總共有□顆`,
    factorB: (a, p) => `${a}個人，每個人要有□顆糖果，總共${p}顆`,
    factorA: (b, p) => `□個人，每個人要有${b}顆糖果，總共${p}顆`,
  },
  {
    id: "sticker",
    story: (a, b, p) => `一包貼紙有${b}張，買了${a}包，總共有${p}張`,
    product: (a, b) => `一包貼紙有${b}張，買了${a}包，總共有□張`,
    factorB: (a, p) => `一包貼紙有□張，買了${a}包，總共${p}張`,
    factorA: (b, p) => `一包貼紙有${b}張，買了□包，總共${p}張`,
  },
  {
    id: "seat",
    story: (a, b, p) => `${a}排座位，每排坐${b}個人，總共有${p}個人`,
    product: (a, b) => `${a}排座位，每排坐${b}個人，總共有□個人`,
    factorB: (a, p) => `${a}排座位，每排坐□個人，總共${p}個人`,
    factorA: (b, p) => `□排座位，每排坐${b}個人，總共${p}個人`,
  },
  {
    id: "book",
    story: (a, b, p) => `每天看${b}頁故事書，連續看了${a}天，總共看了${p}頁`,
    product: (a, b) => `每天看${b}頁故事書，連續看了${a}天，總共看了□頁`,
    factorB: (a, p) => `每天看□頁故事書，連續看了${a}天，總共看了${p}頁`,
    factorA: (b, p) => `每天看${b}頁故事書，連續看了□天，總共看了${p}頁`,
  },
  {
    id: "crayon",
    story: (a, b, p) => `一盒蠟筆有${b}枝，老師發了${a}盒，總共有${p}枝`,
    product: (a, b) => `一盒蠟筆有${b}枝，老師發了${a}盒，總共有□枝`,
    factorB: (a, p) => `一盒蠟筆有□枝，老師發了${a}盒，總共${p}枝`,
    factorA: (b, p) => `一盒蠟筆有${b}枝，老師發了□盒，總共${p}枝`,
  },
  {
    id: "comic",
    story: (a, b, p) => `${a}本漫畫，每本有${b}頁，總共有${p}頁`,
    product: (a, b) => `${a}本漫畫，每本有${b}頁，總共有□頁`,
    factorB: (a, p) => `${a}本漫畫，每本有□頁，總共${p}頁`,
    factorA: (b, p) => `□本漫畫，每本有${b}頁，總共${p}頁`,
  },
  {
    id: "rope",
    story: (a, b, p) => `一次跳繩跳${b}下，跳了${a}次，總共跳了${p}下`,
    product: (a, b) => `一次跳繩跳${b}下，跳了${a}次，總共跳了□下`,
    factorB: (a, p) => `一次跳繩跳□下，跳了${a}次，總共跳了${p}下`,
    factorA: (b, p) => `一次跳繩跳${b}下，跳了□次，總共跳了${p}下`,
  },
  {
    id: "marble",
    story: (a, b, p) => `每袋有${b}顆彈珠，拿了${a}袋，總共有${p}顆`,
    product: (a, b) => `每袋有${b}顆彈珠，拿了${a}袋，總共有□顆`,
    factorB: (a, p) => `每袋有□顆彈珠，拿了${a}袋，總共${p}顆`,
    factorA: (b, p) => `每袋有${b}顆彈珠，拿了□袋，總共${p}顆`,
  },
  {
    id: "bead",
    story: (a, b, p) => `一條手環要串${b}顆珠子，串了${a}條，總共要${p}顆珠子`,
    product: (a, b) => `一條手環要串${b}顆珠子，串了${a}條，總共要□顆珠子`,
    factorB: (a, p) => `一條手環要串□顆珠子，串了${a}條，總共要${p}顆珠子`,
    factorA: (b, p) => `一條手環要串${b}顆珠子，串了□條，總共要${p}顆珠子`,
  },
  {
    id: "table",
    story: (a, b, p) => `每桌坐${b}個人，有${a}桌，總共有${p}個人`,
    product: (a, b) => `每桌坐${b}個人，有${a}桌，總共有□個人`,
    factorB: (a, p) => `每桌坐□個人，有${a}桌，總共${p}個人`,
    factorA: (b, p) => `每桌坐${b}個人，有□桌，總共${p}個人`,
  },
];

function pickTemplate(templateId) {
  if (templateId) {
    const found = LIFE_TEMPLATES.find((t) => t.id === templateId);
    if (found) return found;
  }
  return LIFE_TEMPLATES[Math.floor(Math.random() * LIFE_TEMPLATES.length)];
}

/** 背誦：完整生活句（含答案） */
export function randomLifeStory(a, b, templateId) {
  const t = pickTemplate(templateId);
  return t.story(a, b, a * b);
}

/** 測驗：依空格類型出生活題 */
export function lifeQuestionText(a, b, product, blank, templateId) {
  const t = pickTemplate(templateId);
  if (blank === "product") return t.product(a, b);
  if (blank === "factorB") return t.factorB(a, product);
  return t.factorA(b, product);
}

/** 測驗：為 n 題決定哪些出生活題（至少 3 題） */
export function pickLifeQuestionFlags(count) {
  const flags = Array(count).fill(false);
  const lifeCount = Math.min(count, Math.max(3, Math.round(count * 0.45)));
  const indices = [...Array(count).keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  indices.slice(0, lifeCount).forEach((idx) => {
    flags[idx] = true;
  });
  return flags;
}
