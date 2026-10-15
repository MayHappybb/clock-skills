// Typist — the time, in words, typed out live.
//
//   TWENTY-FIVE          QUARTER              TEN O'CLOCK
//   TO MIDNIGHT          PAST NOON            IN THE EVENING
//
// When the minute turns, a block cursor backspaces over what has changed,
// starting from the end, and types the new words in at a human, uneven pace,
// then sits blinking after the last word. Words that stay the same are never
// touched, so 10:09 -> 10:10 retypes one word and 10:30 -> 10:31 rewrites
// both lines. On the hour it writes what part of the day it is.
//
// No CGRAM at all: the words, and the cursor (ROM 0xff), are factory
// characters. Each keystroke holds at least 110 ms and most hold longer, so on
// the glass a letter lands, not flickers in; the backspace runs a little
// quicker, as it does under a held key.

import { noise } from '../js/kit.js';

const HOURS = ['MIDNIGHT', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT',
  'NINE', 'TEN', 'ELEVEN', 'NOON', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN',
  'EIGHT', 'NINE', 'TEN', 'ELEVEN'];
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'QUARTER', 'SIXTEEN', 'SEVENTEEN',
  'EIGHTEEN', 'NINETEEN'];

function minutesWords(n) {
  if (n === 30) return 'HALF';
  if (n < 20) return n === 1 ? 'ONE MINUTE' : ONES[n];
  return n === 20 ? 'TWENTY' : `TWENTY-${ONES[n - 20]}`;
}

function partOfDay(h) {
  if (h >= 5 && h < 12) return 'IN THE MORNING';
  if (h >= 12 && h < 17) return 'IN THE AFTERNOON';
  if (h >= 17 && h < 21) return 'IN THE EVENING';
  return 'AT NIGHT';
}

/** The time as two lines of at most 16 characters. */
export function phrase(h, m) {
  if (m === 0) {
    if (h === 0) return ['MIDNIGHT', ''];
    if (h === 12) return ['NOON', ''];
    return [`${HOURS[h]} O'CLOCK`, partOfDay(h)];
  }
  if (m <= 30) return [minutesWords(m), `PAST ${HOURS[h]}`];
  return [minutesWords(60 - m), `TO ${HOURS[(h + 1) % 24]}`];
}

// --------------------------------------------------------------- the typing

const LEAD = 0.6;                     // the cursor waits a beat before it starts

/**
 * Keystrokes that turn `from` into `to`, as [line, kind, char] with kind
 * 'del' or 'type'. Only what differs after the common start of each line is
 * deleted, from the end of the text backwards, then retyped forwards.
 */
function script(from, to) {
  const keep = from.map((line, i) => {
    let k = 0;
    while (k < line.length && k < to[i].length && line[k] === to[i][k]) k++;
    return k;
  });
  const keys = [];
  for (let i = 1; i >= 0; i--) for (let c = from[i].length; c > keep[i]; c--) keys.push([i, 'del']);
  for (let i = 0; i < 2; i++) for (const ch of to[i].slice(keep[i])) keys.push([i, 'type', ch]);
  return keys;
}

/** How long each keystroke holds: deletes are steady, typing is uneven. */
function durations(keys, seed) {
  return keys.map(([, kind, ch], i) => {
    if (kind === 'del') return 0.11;
    const base = 0.13 + noise(i, seed) * 0.12;
    return ch === ' ' || ch === '-' ? base + 0.12 : base;   // a beat between words
  });
}

export default {
  name: 'Typist',
  blurb: 'The time in words, typed live: each minute a cursor backspaces over what changed and types the new words.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const before = kit.clockFields(new Date(date.getTime() - 60000));
    const from = phrase(before.h, before.m);
    const to = phrase(fields.h, fields.m);

    const keys = script(from, to);
    const holds = durations(keys, Math.floor(date.getTime() / 60000));
    const lines = [...from];
    // At rest the cursor sits after the text, on the second line if it has any.
    const rest = (l) => (l[1].length ? [1, l[1].length] : [0, l[0].length]);
    let cursor = rest(from), t = LEAD, typing = false;
    // Edit lines to where the typist has got to by `sec`.
    for (let i = 0; i < keys.length && t <= sec; i++) {
      const [line, kind, ch] = keys[i];
      lines[line] = kind === 'del' ? lines[line].slice(0, -1) : lines[line] + ch;
      cursor = [line, lines[line].length];
      t += holds[i];
      typing = true;
    }
    const done = t <= sec;
    if (done) { cursor = rest(to); typing = false; }

    lines.forEach((line, row) => lcd.textAt(0, row, line.padEnd(16, ' ').slice(0, 16)));
    // The cursor is solid while keys are going and blinks once it rests, at
    // the same 0.5 s on, 0.5 s off as a terminal's.
    const lit = typing && !done ? true : (sec % 1) < 0.5;
    const [row, col] = cursor;
    if (lit && col < 16) { lcd.setCursor(col, row); lcd.data(0xff); }
  },
};
