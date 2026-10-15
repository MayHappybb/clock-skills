// Typewriter: what the typist writes between the times. A desk log in
// capitals, a line at a time, by the hour of the day. No numbers in it, so
// nothing on the sheet reads as a second time.

const BANK = {
  morning: ['KETTLE ON.', 'FOG ON THE BAY', 'GULLS AGAIN.', 'MILK CAME.', 'SUN ON SILL.', 'BREAD RISING.',
    'FIRST POST.', 'COFFEE TOO HOT', 'SHUTTERS OPEN', 'WIND FROM SW.', 'DEW ON GLASS.', 'BIRDS LOUD.'],
  day: ['RAIN ON TIN.', 'TEA GONE COLD', 'RIBBON IS LOW', 'CAT ON DESK.', 'SKY CLEARING.', 'LETTER SENT.',
    'BELLS IN TOWN', 'KITE ON HILL.', 'BARO FALLING.', 'STILL RAINING', 'MAIL IS LATE.', 'WARM WIND.'],
  evening: ['LAMP LIT.', 'SHIPS IN.', 'SUPPER LATE.', 'CRICKETS.', 'TIDE TURNING.', 'LAST LIGHT.',
    'DOGS BARKING.', 'RED SKY.', 'DOOR LOCKED.', 'SOUP ON.', 'RADIO LOW.', 'GULLS QUIET.'],
  night: ['MOON IN ELMS.', 'HOUSE ASLEEP.', 'ONE MORE LINE', 'OWL IN YARD.', 'STARS OUT.', 'FROST ON PANE',
    'CANDLE LOW.', 'QUIET NOW.', 'TRAIN FAR OFF', 'RAIN AGAIN.', 'CAT OUT.', 'STILL AWAKE.'],
};

const HOURS = ['TWELVE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN'];

/** The line the typist starts each hour with: the hour, in words. */
export const hourLine = (h) => `${HOURS[h % 12]} O'CLOCK`;

function bankOf(h) {
  if (h >= 23 || h < 6) return BANK.night;
  if (h < 12) return BANK.morning;
  if (h < 18) return BANK.day;
  return BANK.evening;
}

/**
 * One log line, as a list of keystrokes [col, char, isX]: plain text, or
 * with a typo the typist x's out and types again ("LAMP LTI xxx LIT.").
 * `r` is a number in [0, 1) and `r2` another.
 */
export function logLine(h, r, r2, width) {
  const bank = bankOf(h);
  const text = bank[Math.floor(r * bank.length)];
  const keys = [];
  const words = text.split(' ');
  // a typo: swap two letters of one word, x it out, retype it
  let typo = -1;
  if (r2 < 0.4) {
    const w = Math.floor(r2 * 97) % words.length;
    const word = words[w].replace(/[.]$/, '');
    if (word.length >= 3 && text.length + word.length + 1 <= width) typo = w;
  }
  let col = 0;
  words.forEach((word, wi) => {
    if (wi > 0) col++; // the space bar
    if (wi === typo) {
      const bare = word.replace(/[.]$/, '');
      const k = Math.floor(r * 7) % (bare.length - 1);
      const wrong = bare.slice(0, k) + bare[k + 1] + bare[k] + bare.slice(k + 2);
      for (let i = 0; i < wrong.length; i++) keys.push([col + i, wrong[i], 0]);
      for (let i = 0; i < wrong.length; i++) keys.push([col + i, 'x', 1]);
      col += wrong.length + 1;
    }
    for (let i = 0; i < word.length; i++) keys.push([col + i, word[i], 0]);
    col += word.length;
  });
  return keys;
}
