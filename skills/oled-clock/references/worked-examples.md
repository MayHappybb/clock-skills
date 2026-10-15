# How each shipped design solves its problem

Each file in `sim/designs/` opens with a header comment explaining its idea
and how every frame is derived from the clock. This is the short version:
what each one teaches, so you know which to read before writing your own.

| Key | Module | What happens on the minute | Read it for |
|---|---|---|---|
| `neon` | 128x64 | dead tubes sputter out; new ones strike end to end | a letterform as a single continuous path; crossings "painted out"; a custom script alphabet |
| `numberfolk` | 128x64 | the old digit leaves in character, the new one arrives | glyphs as characters (eyes, feet, props); per-minute random exits and entrances |
| `truchet` | 128x64 | tiles lift, rotate and swap shape into the new digit | one parametric tile shape that can morph into any other; a figure set in a matching ground |
| `mercury` | 128x64 | strokes bead, pool and climb out as the new digit | metaballs with bounded kernels; matching charges by angle; chrome from a single horizon band and a glint |
| `brush` | 128x64 | the old digit washes out; the brush writes the new one | pressure-profiled strokes in stroke order; flying white; Chinese numerals and a seal |
| `stringart` | 128x64 | threads snap; a shuttle strings the new digit | curves only from envelopes of straight lines; legibility through deliberate thread density |
| `opart` | 128x64 | a ripple dissolves the old digits and develops the new ones | type with no outline or fill, only a texture change; signed distance fields; why most texture contrasts vanish at true size |
| `extrude` | 128x64 | the digit spins about its axis, edge-on at :00 | per-pixel ray casting of extruded solids; hatching as lighting; a shape swap hidden at edge-on |
| `frog` | 128x64 | the frog's tongue takes the fly at :58 | a character drawn from shapes and sprites; eyes that track; night dimming; two independent burn-in orbits |
| `kitcat` | 128x64 | a wink and an ear twitch; a yawn on the hour | pendulum motion (`cos(pi*sec)`); a black character on a black screen drawn by its outline |
| `invaders` | 128x64 yellow-blue | the cannon shoots the old digit apart, a ship drops the new one | a game simulated from the start of the minute; using the yellow band as a separate zone |
| `dino` | 128x64 | a pterodactyl drops the new digit, the old one falls on the track and is jumped | sprites copied from a real source; jumps solved from obstacle sizes; a scrolling world continuous across minutes |
| `tetris` | 128x64 | line-clear, then the new digit is built piece by piece | a search run once at module load (tilings, drop order); per-piece start times instead of simulation; `driver: 'dirty'` |
| `flip` | 128x64 | split-flap cards fall in perspective; the board riffles on the hour | per-pixel inverse projection for 3D; why dark cards beat lit ones on an OLED |
| `watch` | 128x64 | (continuous) | hands that rasterise cleanly at every angle; XOR for a hand over hands; dither anchored to a moving shape |
| `aquarium` | 128x64 blue | a school of fish swirls round the old digit and draws the new one | many agents placed on a digit's centre-line; the hour as a bigger event |
| `reel` | 128x32 | the face rolls up to the next minute | the 128x32's hidden RAM half; a transition that costs one byte a frame (`startLine`) |
| `tape` | 128x32 | counter-wheel digits roll; the ruler creeps | a continuous scale derived from time of day; why the hardware scroll was rejected |
| `classic` | 128x64 | nothing | the baseline to beat |
| `specimen` | 128x64 | | the kit's type, side by side |

## Patterns that recur

**The minute turn is an event scheduled backwards from :00.** Nearly every
design computes "seconds until the turn" and lays out the event so the new
time lands exactly at :00 (`tetris`, `invaders`, `dino`, `aquarium`). Work
out each actor's start time from the end, not by simulating forwards.

**A clock must never show a wrong time.** During a transition, a slot may be
empty, in motion, or half-built, but it should never read as a different
time (showing 10:50 at 10:59:56 is a bug, even if it is the result of an
animation). Multi-digit turns (:X9, the hour, midnight) are where this
breaks; always render a sheet across 10:59:5x and 23:59:5x.

**Randomness comes from `minuteKey`.** `noise(fields.minuteKey, k)` gives the
same "random" value for the whole minute and a different one next minute,
so a still at any instant agrees with the animation around it.

**Simulate from a known start, inside `frame()`.** Shields being eaten
(`invaders`) are replayed from the start of the minute every frame. At this
resolution that costs nothing, and it keeps `frame()` pure.

**The letterform is the concept.** The second round of designs (`neon`
to `extrude`) each draw their own digits; none uses the kit's fonts for the
time. Review a design's ten digits as a set (`out/<key>-digits.png`): a
striking 0 is worth little if its 1 and 7 can be confused.

**Keylines.** A sprite in front of a busy background gets a one-pixel dark
outline (`frog` lips, `dino`'s T-Rex, `kitcat`'s white parts, `watch`'s
hands). On an OLED a dark outline is free: it is unlit pixels.

**Dark, then lit.** Faces that light large areas (`flip` with lit cards, a
solid white dial) glare and wear evenly. The designs that look best on the
glass are mostly black with lit outlines and a few solid accents.

**Burn-in is designed, not patched.** Every shipped design moves its static
parts: `kit.orbit()` for blocks, a second orbit out of phase for a second
block (`frog`, `watch`), a drifting dither (`aquarium` sand), and night
dimming (`frog`, `watch`, `tape`). `check.mjs` shows the result.

## Territory nothing has explored yet

- The hardware horizontal scroll used for something it suits: a ticker band
  that runs for a whole minute without a byte sent.
- `oled.offset()` and `startLine` together for a vertical parallax.
- A face that uses inverse (`oled.invert`) as a once-an-hour flash.
- The 1.3" SH1106 module (`130-128x64`), whose larger pixels change what
  reads at a distance.
- A word clock ("TEN PAST TEN") in a tiny font, or a binary / BCD clock with
  real LEDs drawn as dots with bloom.
- Weather or a sun arc, from a data feed the design receives as a field.
- The portrait stance: a 64x128 face (rotate the module; the canvas would
  need turning in the player).
