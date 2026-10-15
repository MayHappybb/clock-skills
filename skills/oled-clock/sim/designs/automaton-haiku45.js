// Automaton — flip-card display, like old airport/train boards.
// Two large cards (tens and ones) show the current minute.
// At each minute turn, the ones card flips up smoothly (0.6 s), revealing
// the new digit underneath. Every 10 minutes, the tens card flips.
// Bold numerals drawn with thick strokes; the flip is mechanical and precise.

import { orbit, ease, progress as prog, clamp, lerp, ON, OFF, font3x5 } from '../js/kit.js';

const PI = Math.PI, TAU = 2 * PI;

// ========== DIGIT DRAWING ==========
// Draw each digit as bold thick strokes, guaranteed to read at small sizes.

function drawDigitStroke(g, digit, x, y, scale = 1) {
  // Bold art-deco digits drawn from center (x, y).
  const w = 6 * scale, h = 10 * scale;

  const strokes = {
    0: () => {
      g.fillEllipse(x, y, w, h, ON);
      g.fillEllipse(x, y, w - 1.5 * scale, h - 1.5 * scale, OFF);
    },
    1: () => {
      g.thickLine(x - 0.5 * scale, y - h, x - 0.5 * scale, y + h, 1.2 * scale, ON);
      g.thickLine(x - 1.5 * scale, y - h + 1 * scale, x - 0.5 * scale, y - h, 1 * scale, ON);
      g.thickLine(x - 2 * scale, y + h, x + 1.5 * scale, y + h, 1 * scale, ON);
    },
    2: () => {
      g.arc(x, y - h + 1.5 * scale, w * 0.7, w * 0.7, 0, PI, 1.2 * scale, ON);
      g.thickLine(x + w * 0.7, y - h + 1.5 * scale, x - w * 0.7, y + 0.5 * scale, 1 * scale, ON);
      g.thickLine(x - w * 0.7, y + 0.5 * scale, x + w * 0.7, y + h, 1 * scale, ON);
      g.thickLine(x - w * 0.7, y + h, x + w * 0.7, y + h, 1 * scale, ON);
    },
    3: () => {
      g.arc(x, y - h + 1 * scale, w * 0.7, w * 0.7, 0, PI, 1.2 * scale, ON);
      g.arc(x, y + h - 1 * scale, w * 0.7, w * 0.7, PI, TAU, 1.2 * scale, ON);
      g.thickLine(x - w * 0.4, y, x + w * 0.7, y, 1 * scale, ON);
    },
    4: () => {
      g.thickLine(x + w * 0.7, y - h, x + w * 0.7, y + h, 1.2 * scale, ON);
      g.thickLine(x - w * 0.7, y - 0.5 * scale, x + w * 0.7, y - 0.5 * scale, 1 * scale, ON);
      g.thickLine(x - w * 0.7, y - h, x + w * 0.7, y - 0.5 * scale, 1 * scale, ON);
    },
    5: () => {
      g.thickLine(x + w * 0.7, y - h, x - w * 0.7, y - h, 1 * scale, ON);
      g.thickLine(x - w * 0.7, y - h, x - w * 0.7, y, 1 * scale, ON);
      g.arc(x, y + 0.5 * scale, w * 0.7, w * 0.7, PI, TAU, 1.2 * scale, ON);
    },
    6: () => {
      g.arc(x, y - h + 1 * scale, w * 0.7, w * 0.7, 0, PI, 1.2 * scale, ON);
      g.arc(x, y + h - 1 * scale, w * 0.7, w * 0.7, PI, TAU, 1.2 * scale, ON);
      g.thickLine(x - w * 0.7, y - h + 1 * scale, x - w * 0.7, y + h - 1 * scale, 1 * scale, ON);
    },
    7: () => {
      g.thickLine(x - w * 0.7, y - h, x + w * 0.7, y - h, 1 * scale, ON);
      g.thickLine(x + w * 0.7, y - h, x - w * 0.7, y + h, 1.2 * scale, ON);
    },
    8: () => {
      g.arc(x, y - h + 1 * scale, w * 0.7, w * 0.7, 0, PI, 1.2 * scale, ON);
      g.arc(x, y + h - 1 * scale, w * 0.7, w * 0.7, PI, TAU, 1.2 * scale, ON);
      g.thickLine(x - w * 0.7, y - 0.3 * scale, x + w * 0.7, y - 0.3 * scale, 1 * scale, ON);
    },
    9: () => {
      g.arc(x, y - h + 1 * scale, w * 0.7, w * 0.7, 0, PI, 1.2 * scale, ON);
      g.arc(x, y + h - 1 * scale, w * 0.7, w * 0.7, PI, TAU, 1.2 * scale, ON);
      g.thickLine(x + w * 0.7, y - h + 1 * scale, x + w * 0.7, y + h - 1 * scale, 1 * scale, ON);
    },
  };

  if (strokes[digit]) strokes[digit]();
}

// ========== CARD DRAWING ==========

function drawFlipCard(g, x, y, digitNow, digitNext, flipProgress, wobble) {
  // A flip card showing digitNow. If flipProgress > 0, it's flipping to digitNext.
  // wobble: idle vibration, -1..1
  // flipProgress: 0 = fully showing digitNow, 1 = fully showing digitNext

  const cx = x, cy = y;
  const cardW = 16, cardH = 20;

  // Rotation angle for the flip (around horizontal axis).
  let angle = flipProgress * PI; // 0 to π (180 degrees)

  // During idle, wobble slightly (bearing play).
  if (flipProgress === 0) {
    angle += wobble * 0.08;
  }

  // Y-scale due to perspective (foreshortening).
  const yScale = Math.cos(angle);

  // Determine which digit to show based on flip progress.
  const displayDigit = angle < PI / 2 ? digitNow : digitNext;
  const displayScale = Math.abs(yScale); // fade as it rotates away

  // Draw the digit inside the card.
  if (displayScale > 0.15) {
    const alphaScale = displayScale < 0.4 ? displayScale / 0.4 : 1; // fade in/out at extremes
    const digitScale = 0.9 * displayScale;

    // For very foreshortened states, dither the digit.
    if (digitScale > 0.8) {
      drawDigitStroke(g, displayDigit, cx, cy, digitScale);
    } else if (digitScale > 0.1) {
      // Draw with dither.
      const centerY = cy;
      g.fillWhere((px, py, ix, iy) => {
        if ((ix + iy) % 2 === 0 || alphaScale > 0.6) {
          const forwardX = px - cx;
          const forwardY = (py - centerY) / Math.max(0.1, digitScale);
          // Very rough digit detection: just show a dot grid.
          return Math.hypot(forwardX, forwardY) < 5;
        }
        return false;
      }, ON, [cx - 8, Math.round(cy - 10 * digitScale) - 1, 16, Math.round(20 * digitScale) + 2]);
    }
  }

  // Draw the card frame (edges).
  const fy0 = Math.round(cy - cardH * Math.abs(yScale) / 2);
  const fy1 = Math.round(cy + cardH * Math.abs(yScale) / 2);
  g.line(Math.round(cx - cardW / 2), fy0, Math.round(cx + cardW / 2), fy0, ON);
  g.line(Math.round(cx - cardW / 2), fy1, Math.round(cx + cardW / 2), fy1, ON);
  if (Math.abs(yScale) > 0.3) {
    g.line(Math.round(cx - cardW / 2), fy0, Math.round(cx - cardW / 2), fy1, ON);
    g.line(Math.round(cx + cardW / 2), fy0, Math.round(cx + cardW / 2), fy1, ON);
  }
}

// ========== ANIMATION STATE ==========

function cardState(fields, sec) {
  const mm = fields.mm;
  const onesNow = mm % 10;
  const onesNext = (mm + 1) % 10;
  const tensNow = Math.floor(mm / 10) % 6;
  const tensNext = (tensNow + 1) % 6;

  // At the start of each minute (sec < 0.6), the ones card flips.
  let flipOnes = 0;
  if (sec < 0.6) {
    flipOnes = ease.inOutCubic(sec / 0.6);
  }

  // Wobble during idle: gentle sine wave.
  const wobble = Math.sin(sec * TAU * 2) * 0.4;

  return { onesNow, onesNext, tensNow, tensNext, flipOnes, wobble };
}

// ========== MAIN ==========

export default {
  name: 'Automaton',
  blurb: 'Flip-card minutes display: bold art-deco digits flip smoothly upward each minute, mechanical and hypnotic.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields, date, oled, night }) {
    oled.contrast(0xcf + (0x12 - 0xcf) * night);

    const [ox, oy] = orbit(date);
    const { onesNow, onesNext, tensNow, tensNext, flipOnes, wobble } = cardState(fields, fields.sec);

    // Draw two flip cards: tens and ones.
    drawFlipCard(g, 40 + ox, 32 + oy, tensNow, tensNext, 0, wobble);
    drawFlipCard(g, 75 + ox, 32 + oy, onesNow, onesNext, flipOnes, wobble);

    // Label and colon.
    g.text('min', 10 + ox, 8 + oy, { font: font3x5 });
    g.pixel(58 + ox, 28 + oy, ON);
    g.pixel(58 + ox, 36 + oy, ON);
  },
};
