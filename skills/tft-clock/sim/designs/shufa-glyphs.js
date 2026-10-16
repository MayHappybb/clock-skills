// shufa: the brush's characters, as strokes in real stroke order.
//
// Each character sits in a 100 x 100 box (the 九宫格 a student writes in).
// A stroke is a list of control points [x, y, w]: where the brush centre
// passes and how wide it presses there (w in box units; 10 = 3.6 px at the
// 36 px size the face writes at). The points are corner-cut (Chaikin) and
// resampled when a sheet is planned, so a few points per stroke are enough.
//
// The shapes follow 楷书 (regular script) brush habits, simplified for
// 36 px: an angled entry press (藏锋起笔), a lighter body, a press at the
// end of a horizontal (顿笔), a shoulder press at a turn (折), needle ends
// on hanging verticals (悬针), hooks flicked out (钩), sweeps that taper
// (撇) and a right-falling stroke that swells into a foot (捺).

// ------------------------------------------------------------ stroke helpers

/** 横: a horizontal, rising slightly, with entry and end presses. */
function heng(x0, y0, x1, y1, w = 9) {
  const dx = x1 - x0, dy = y1 - y0;
  return [
    [x0 - 3, y0 - 3, w * 0.45],
    [x0 + 1.5, y0 + 0.5, w * 1.15],
    [x0 + dx * 0.3, y0 + dy * 0.3, w * 0.82],
    [x0 + dx * 0.7, y0 + dy * 0.7, w * 0.78],
    [x1 - 3, y1 - 0.8, w * 0.95],
    [x1, y1 + 1.2, w * 1.25],
    [x1 - 2, y1 + 2.8, w * 0.7],
  ];
}

/** 竖: a vertical. end: 'dew' (垂露, blunt), 'needle' (悬针, tapered), 'hook' (竖钩, flicked up-left). */
function shu(x0, y0, x1, y1, w = 9, end = 'dew') {
  const L = (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
  const p = [
    [x0 - 2.5, y0 - 3, w * 0.45],
    [x0 + 0.5, y0 + 1, w * 1.2],
    [...L(0.35), w * 0.85],
  ];
  if (end === 'needle') p.push([...L(0.72), w * 0.8], [...L(0.9), w * 0.5], [x1, y1, w * 0.08]);
  else if (end === 'hook') p.push([...L(0.75), w * 0.85], [x1, y1 - 1, w * 1.05], [x1 + 0.5, y1 + 1.5, w * 1.15], [x1 - 3, y1 + 1, w * 0.9], [x1 - 12, y1 - 6, w * 0.1]);
  else p.push([...L(0.75), w * 0.85], [x1, y1 - 2, w * 0.95], [x1 - 0.5, y1 + 0.8, w * 0.55]);
  return p;
}

/** 点: a short teardrop dot from (x0, y0) pressing into (x1, y1). */
function dian(x0, y0, x1, y1, w = 10) {
  return [
    [x0, y0, w * 0.3],
    [(x0 + x1) / 2, (y0 + y1) / 2, w * 0.9],
    [x1, y1, w * 1.3],
    [x1 - 1.5, y1 + 1.2, w * 0.6],
  ];
}

// ------------------------------------------------------------ the characters

const ONE = [heng(8, 52, 92, 47, 11)];
const TWO = [heng(24, 30, 74, 27, 9), heng(8, 74, 92, 69, 11)];
const THREE = [heng(22, 17, 76, 14, 9), heng(28, 47, 70, 45, 8), heng(8, 80, 92, 75, 11)];
const TEN = [heng(8, 45, 92, 40, 10), shu(50, 9, 50, 95, 10, 'needle')];

const SEVEN = [
  heng(8, 50, 90, 38, 10),
  // 竖弯钩: down, round the corner, along the bottom, flick up.
  [[36, 6, 4.5], [40, 11, 11], [40, 40, 9], [40, 66, 9], [43, 80, 9], [52, 86, 9], [72, 86, 8.5], [86, 84, 10], [92, 80, 11], [93, 66, 1]],
];

const EIGHT = [
  [[42, 14, 4.5], [40, 19, 11], [38, 38, 10], [33, 56, 8], [23, 72, 5], [9, 84, 1.2]],
  [[56, 18, 3.5], [58, 24, 6], [64, 40, 8], [72, 56, 11], [80, 70, 14], [86, 78, 15], [92, 82, 8], [99, 83, 1.2]],
];

const NINE = [
  [[46, 5, 4.5], [48, 10, 11], [47, 30, 10], [42, 52, 9], [32, 70, 6], [18, 84, 3], [8, 91, 1]],
  // 横折弯钩
  [[18, 30, 4.5], [22, 34, 10], [44, 32, 8], [62, 30, 9], [66, 28, 11], [68, 34, 11], [65, 48, 9], [63, 62, 9], [66, 78, 9], [74, 86, 9], [86, 86, 9], [92, 84, 11], [94, 78, 10], [95, 67, 1]],
];

const FIVE = [
  heng(16, 14, 82, 11, 9),
  [[42, 12, 4.5], [44, 16, 10], [42, 32, 9], [39, 50, 9.5]],
  // 𠃍: the middle horizontal turning down
  [[37, 48, 4.5], [41, 51, 10], [58, 48, 8.5], [73, 46, 9], [77, 44, 11], [79, 50, 11], [76, 66, 9], [73, 82, 9], [72, 86, 7]],
  heng(6, 88, 94, 84, 11),
];

const SIX = [
  dian(46, 4, 55, 18, 10),
  heng(8, 35, 92, 31, 10),
  [[38, 50, 5], [36, 54, 11], [30, 66, 9], [20, 80, 4], [13, 87, 1.2]],
  [[62, 52, 4], [66, 56, 8], [76, 70, 12], [82, 80, 13], [79, 85, 6]],
];

const FOUR = [
  [[12, 20, 4.5], [14, 24, 10], [14, 50, 9], [14, 82, 9], [14, 87, 6]],
  [[14, 21, 4.5], [18, 24, 10], [50, 22, 8], [82, 20, 9], [86, 18, 11], [88, 24, 11], [86, 50, 9], [86, 82, 9], [86, 87, 6]],
  [[40, 24, 4.5], [40, 28, 9], [39, 44, 8], [34, 58, 6], [27, 65, 1.5]],
  [[58, 24, 4.5], [60, 28, 9], [60, 44, 8.5], [62, 56, 9], [68, 59, 9], [76, 59, 10], [79, 56, 4]],
  [[16, 81, 4], [20, 83, 9], [50, 82, 8], [82, 81, 9], [85, 82, 6]],
];

const ZERO = [
  // 〇 as one sweep, counter-clockwise from the top, closing with a little overlap.
  (() => {
    const p = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = -1.25 - u * (Math.PI * 2 + 0.35);
      const w = 5 + 7 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + (u > 0.9 ? -6 * (u - 0.9) / 0.1 : 0);
      p.push([50 + 36 * Math.cos(a), 50 + 41 * Math.sin(a), Math.max(1.5, w)]);
    }
    return p;
  })(),
];

// 时: 日 then 寸
const SHI = [
  [[8, 24, 4], [10, 27, 9], [10, 50, 8], [10, 76, 8], [10, 80, 5]],
  [[10, 25, 4], [14, 26, 9], [28, 25, 8], [33, 23, 10], [35, 28, 10], [34, 50, 8], [34, 76, 8], [34, 80, 5]],
  [[12, 51, 4], [15, 51, 8], [24, 50, 7], [32, 50, 6]],
  [[12, 75, 4], [15, 75, 8], [24, 74, 7], [32, 74, 6]],
  heng(42, 33, 94, 28, 9),
  [[74, 5, 4.5], [76, 10, 11], [76, 40, 9], [76, 70, 9], [76, 86, 10], [75, 91, 10], [70, 89, 5], [61, 82, 1]],
  dian(50, 49, 58, 62, 10),
];

// 分: 八 over 刀
const FEN = [
  [[42, 5, 4.5], [42, 10, 10], [38, 22, 9], [28, 34, 6], [16, 43, 3], [7, 47, 1]],
  [[56, 7, 3.5], [58, 12, 6], [66, 24, 9], [76, 34, 12], [84, 40, 13], [90, 42, 7], [97, 42, 1.2]],
  [[26, 51, 4.5], [30, 54, 10], [52, 53, 8], [72, 51, 9], [76, 49, 11], [78, 55, 11], [76, 66, 9], [73, 82, 9], [70, 90, 9], [66, 93, 7], [57, 86, 1]],
  [[46, 55, 4.5], [47, 59, 10], [45, 70, 9], [38, 82, 6], [26, 90, 3], [15, 94, 1]],
];

// 正
const ZHENG = [
  heng(18, 13, 82, 10, 9),
  shu(50, 12, 50, 86, 10, 'dew'),
  [[52, 48, 4], [55, 49, 8], [66, 48, 7], [76, 47, 9], [77, 49.5, 5]],
  shu(24, 42, 24, 86, 9, 'dew'),
  heng(6, 89, 94, 85, 11),
];

// 日 and 月, for the date in the inscription
const RI = [
  [[22, 8, 4], [24, 12, 10], [24, 50, 9], [24, 88, 9], [24, 92, 6]],
  [[24, 9, 4], [30, 11, 10], [60, 10, 8], [74, 8, 10], [78, 14, 10], [76, 50, 9], [76, 88, 9], [76, 92, 6]],
  [[28, 49, 4], [32, 50, 8], [52, 49, 7], [72, 49, 6]],
  [[28, 88, 4], [32, 88, 8], [52, 87, 7], [72, 87, 6]],
];
const YUE = [
  [[26, 6, 4], [28, 10, 10], [28, 40, 9], [26, 64, 8], [20, 82, 5], [10, 94, 1]],
  [[28, 7, 4], [34, 9, 10], [60, 8, 8], [74, 6, 10], [78, 12, 10], [76, 50, 9], [76, 82, 9], [74, 92, 9], [68, 90, 5], [60, 84, 1]],
  [[32, 36, 4], [36, 37, 8], [56, 36, 7], [72, 35, 6]],
  [[32, 62, 4], [36, 63, 8], [56, 62, 7], [72, 61, 6]],
];

export const GLYPHS = {
  '日': RI, '月': YUE,
  '〇': ZERO, '一': ONE, '二': TWO, '三': THREE, '四': FOUR, '五': FIVE,
  '六': SIX, '七': SEVEN, '八': EIGHT, '九': NINE, '十': TEN,
  '时': SHI, '分': FEN, '正': ZHENG,
};

const DIGIT = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** A number 0..59 as Chinese numerals: 〇, 九, 十, 十一, 二十, 二十三. */
export function numeral(n) {
  if (n < 10) return [DIGIT[n]];
  const t = Math.floor(n / 10), u = n % 10;
  const out = t === 1 ? ['十'] : [DIGIT[t], '十'];
  if (u) out.push(DIGIT[u]);
  return out;
}

/** The date for the inscription: 十月十六日. */
export function dateText(mon, day) {
  return [...numeral(mon), '月', ...numeral(day), '日'];
}

/** The text for a time: hour + 时, then minute + 分, or 正 on the hour. */
export function phrase(h, m) {
  const hour = [...numeral(h), '时'];
  const min = m === 0 ? ['正'] : [...numeral(m), '分'];
  return { hour, min, all: [...hour, ...min] };
}
