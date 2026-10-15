# The shipped designs, and what each one is for

Read these before writing your own. Between them they cover every technique
worth knowing on this display, and each one exists to solve a specific problem.

```console
node tools/render.mjs --list
node tools/frame.mjs <key>              # the frame as ASCII
node tools/render.mjs <key> --scale 14 --crop view --style clean
```

---

## `classic` — the baseline

Stock ROM font, centred `HH:MM:SS`, no motion. This exists so that "make it
better" is an argument against something concrete rather than a feeling. Nearly
every 1602 clock on the internet is this.

**1 tile, 0 drawn.** Nothing here costs CGRAM: the whole frame is factory
characters.

---

## `monolith` — a drawn 5x16 typeface

Digits five dots wide and sixteen tall, so each spans both character rows. Four
digits is eight tiles: slots 0-3 hold the top halves, slots 4-7 the bottom
halves of the same four digits.

**The lesson is trap #1.** The obvious implementation — draw all top halves, then
reuse the same slots for the bottom halves — silently changes row 0 underneath
you. Both halves must be resident together. This design is the smallest
demonstration of that, and the reason `tools/frame.mjs` exists.

The colon has no slot left, so it is stock ROM written into both rows, which
reads as one tall mark. The seconds bar is ROM `0xa5`. It was `0x0e` until the
datasheet showed that code is a CGRAM alias (trap #8): on hardware the bar
was ten copies of slot 6.

**8 tiles.**

**Reworked:** digits now roll like a mechanical counter drum, the old numeral
rising out as the new one rises in over 0.6 s. A rolling digit trades its two
static tiles for two moving ones, so the frame never needs more than eight.
The colon and seconds bar use ROM `0xa5`.

---

## `aurora` — a full-frame animation, cheaply

Stock-ROM time on the top row, a 40x8 animated strip on the bottom. Row 0 costs
nothing, so all eight slots are free for the strip — and eight 5x8 tiles is
exactly a 40x8 canvas, so the whole strip is redrawn from scratch every frame.

**The lesson:** eight tiles is a tiny framebuffer, not a set of characters. Pay
for the moving part with CGRAM and the static part with ROM, and you can animate
anything in that half.

The strip carries a trace that beats once a second, locked to the wall clock.

**5 tiles, redrawn every frame.** ~28 ms on 100 kHz I2C, at 20 fps.

**Reworked:** the strip used to scroll 40 columns a second, moving every dot
every 25 ms. The glass needs 150 ms, so on hardware it was a grey smear. It is
now a sweep: a write head draws the trace left to right and erases just ahead,
so each column changes once per pass and holds. The trace is a one-dot line.

---

## `flipclock` — a drawn 5x8 face with a transition

Eight cells on the top row, each a purpose-drawn 5x8 digit. When a digit turns,
the incoming one wipes down over the outgoing one.

The transition blend costs extra tiles, so it is built **after** the final tiles
and dropped if there is no room — a busy time loses the animation rather than
corrupting the time. `TileAllocator.overflow` is what makes that safe.

Also the design that shipped with trap #3: the digit index was counted
left-to-right, so every digit animated on the wrong beat. It looked fine until
`--t 0.08` was rendered.

With the LC lag rendered, the 0.24 s wipe is barely visible: the new digit
mostly fades in. That is what it does on hardware too, and a good illustration
of trap #9. A wipe that should read as a wipe needs to be at least twice as
long.

**7 tiles typically**, one spare for the blend.

**Reworked:** the 0.24 s wipe was 30 ms a row, which the glass could not show.
It is now a split-flap flip: for 150 ms the new top half sits over the old
bottom half with the seam lit, then the bottom lands. The digits are a bold
5x7 face. The old code flipped from "digit minus one", wrong at every minute
(5 -> 0 flipped from 9) and at midnight (trap #12).

---

## `ember` — pushing weight, and a transition on a full budget

A ten-dot-wide, eight-tall geometric face with three-dot strokes and four-dot
counters. Ten dots wide is where a 1602 face starts to look heavy rather than
thin, and three-dot strokes is the practical ceiling — go further and the
counters close up.

The shutter on a turning digit demonstrates trap #4: with all eight slots spent,
the transition is only possible because a turning digit's tiles are private to
it, so they are rewritten in place. Zero extra slots.

**8 tiles, exactly.** ~46 ms on 100 kHz I2C.

**Reworked:** the shutter is 0.6 s instead of 0.26 s, at 12 fps instead of 4
(at 4 fps a 0.26 s shutter was a single frame), and flips from the right digit
(trap #12).

---

## `clone` — a reproduction of a reference photograph

A negative amber module with the time enormous across the glass and the seconds
small at its right. It was written believing everything was reproducible except the digit
proportions, since four digits at the reference's size drawn one bitmap each
would need sixteen tiles.

So it keeps the width — which is what makes the reference read as a wall clock —
and gives up the height. Minutes and hours sit on one row, the date underneath to
stop the frame hanging off the top of the panel.

**The lesson is the trade**, and a warning. When the budget forbids the thing
you were asked to copy, decide which property is load-bearing and spend the
budget on that. But first check that the budget really forbids it. Here it did
not: `slab` reproduces the reference at full height. The budget only forbade
drawing each digit as its own picture.

**8 tiles.**

---

## `focus` — the largest *drawn* digits

Two digits at 10x16 with real curves: four tiles each, eight in total, the
exact ceiling for one bitmap per digit. The minutes are the hero; the rest
of the time is spelled out beside them in stock ROM.

**The lesson:** this is the largest a digit can be when every digit is its own
picture. Four digits that big need a different construction: see `slab`.

**8 tiles, exactly, no spare.** ~39 ms on 100 kHz I2C.

**Reworked:** the shutter is 0.8 s, flips from the right digit (trap #12), and
the "H10 / S37" labels became words: `MIN PAST 10 / AND 37 SEC`.

---

## `slab` — the reference photo, dot for dot

An amber module showing `00:50` with small seconds. Every dot was read off
an enlarged crop of the photo, and the render was laid over the photo to check.

Each digit is three cells wide and both rows tall, assembled from parts
(`sim/js/blockface.js`):

- left strokes are whole cells, ROM `0xff`
- right strokes are only **3 dots wide**, in the cell's left columns. The two
  dark columns after them are the space before the next digit.
- top and bottom bars are 3 dots thick; the middle bar is 2, on the last two
  rows of the top cell, so the lower counter is taller
- the colon is ROM `0x3a` in both rows: four beads
- the seconds are a squared 5x7 font, top-aligned in the bottom row, flush
  right at columns 14-15. Column 0 is empty.

```
0: F T R    5: F M M3    (F = 0xff, R = 3-dot stroke,
   F B R       B B R      M = top + middle bars)
```

An earlier version guessed at this instead of measuring it. It had
full-width right strokes, a 3-dot middle bar, a drawn colon and ROM seconds,
and read as a different clock.

**The lesson:** count distinct tiles, not cells, and measure a reference
before drawing it. The face needs 1-7 parts (4-5 most of the day); with two
seconds tiles that overflows for 0.8% of seconds, when the seconds drop to
ROM digits instead.

**Up to 8 tiles.** ~35 ms on 100 kHz I2C, 4 fps.

---

## `stack` — the block face, rebuilt by falling pieces

`slab`'s face, animated. When a digit turns it flashes out like a cleared line
in a falling-block game, then its parts drop into place one at a time, bottom
row first, accelerating as they fall.

Only one piece is ever in flight, and a piece between rows needs two tiles of
its own. Allocation order makes it safe: face first, then the flight, then the
seconds. If the flight does not fit, the piece steps a whole cell at a time
using its own part's tile; the face never gives.

Pacing is for the glass: 200 ms flash steps, 0.3-0.45 s falls. With the LC lag
rendered, a falling piece leaves a short streak, which reads as speed.

**Up to 8 tiles.** ~42 ms on 100 kHz I2C, 12 fps.

---

## `dial` — an analog clock, drawn in millimetres

A 15x16 canvas (six tiles) with twelve marks, an hour and a minute hand, and
a seconds dot orbiting outside the marks. The date is in ROM beside it.

Every dot is placed where it sits on the glass, gaps included, and the dial is
drawn in mm and sampled at those dot centres. Drawn in dot coordinates the
circle would be a tall oval with a kink at each seam. The centre is put on a
real dot, so hands at 12/3/6/9 have a straight line of dots to run along.

Two things were tried and dropped after rendering. A full ring left the hands
no room. A doubled hour hand merged with the minute hand into a blob. At this
size, hands must be one dot wide and told apart by length.

**6 tiles.** ~35 ms on 100 kHz I2C, 4 fps.

---

## `cipher` — free noise, paid-for digits

The A00 ROM's half-width katakana (0xA6-0xDD) cost nothing, so the noise is
free and CGRAM goes only on the bold 5x7 time digits.

A changing digit runs through katakana before locking: two glyphs for the
seconds' ones, one more per cell further left, so a change that reaches the
hours ripples in from the right. Each glyph holds 150 ms, the LC switching
time. The date row is encrypted noise that decodes left to right at :08,
holds for 20 s, then scrambles again.

**6 tiles.** ~35 ms on 100 kHz I2C, 10 fps.

---

## `tide` — the shared parts as the effect

A simplified block face (full-width strokes, three parts), with every part
redrawn each frame with a waterline
through it. Because all digits share the parts, one redraw moves the water
through every digit at once, and a ripple with a period of exactly one cell
runs unbroken across tiles that know nothing about each other. The water
rises over the minute and drains as it turns.

The waterline differs between the two rows, so each part needs a copy per row
it appears in: six parts and two colon halves, eight exactly.

Under the LC lag the half-lit mesh above the waterline reads as a soft grey
rather than a checkerboard, which works in its favour.

**8 tiles.** ~42 ms on 100 kHz I2C, 12 fps.

---

## `hourglass` — the leftover budget, spent on a picture

The simplified block face uses four slots, colon included. The other four make a private
10x16 canvas: a sand glass that drains over the minute, with a trickle through
the neck, and flips end over end as the minute turns.

The flip is a vertical squash by cos(angle), one second long. A 0.7 s flip was
tried first; rendered with the LC lag, the middle of it smeared.

**8 tiles.** ~42 ms on 100 kHz I2C, 12 fps.

---

## `pong` — the score is the time

The Pong clock: the left player is the hours, the right the minutes. Every
minute the hours player misses; on the hour the minutes player does. Each
point is a whole rally derived from the clock: the serve leaves the net at
:01 and the ball's speed is set so that after nine crossings it reaches the
loser at :59.5, just as that paddle moves the wrong way.

Scores are ROM. The net is one tile. The ball is 2x2 and moves in glass
columns (`Stage` in `kit.js`), so the gap between cells swallows half of it
instead of splitting it across two cells: it never needs more than two tiles.
Paddles need two each when they straddle the rows.

**Up to 7 tiles.** ~39 ms on 100 kHz I2C, 12 fps. The LC lag gives the ball a
two-dot comet tail.

---

## `chomp` — a character as the wipe head

Block digits with a colon of blinking power pellets (ROM 0xa5). On the minute
Pac-Man runs in from the left and eats the old time; the new time is left in
his wake.

He is three cells by two rows, 10 x 11.6 mm, drawn in mm at the real dot
centres. Two cells wide would have been a tall oval. His middle column is
solid in both mouth frames, so those cells are ROM 0xff and he costs four
tiles, not six.

The face is a four-part kit (`T`, `M`, `B`, and the photo's 3-dot right
stroke `R`, with full-width bars in the right column). Old and new times
together never need more than four parts, so the run is exactly eight. The
photo's own face would need up to seven parts across both times.

**8 tiles while he runs.** ~42 ms on 100 kHz I2C, 12 fps, 160 ms per step.

---

## `carousel` — display shift

The first design to use the controller's display shift. Each DDRAM line is a
40-address ring, so it holds two faces 20 apart. On the minute the controller
shifts left twenty times and the next face pulls in from the right, coupled
to the old one by a drawbar. The steps ease over 4.8 s; the quickest holds
153 ms.

On hardware each step is one 39 µs instruction. Because `frame` must define
the whole picture, the design issues Return Home and then up to 20 shifts
every frame (Return Home and Clear undo the shift; the emulator once missed
this). Firmware with state sends one byte per step.

**Up to 6 tiles**: the four-part face shared by both times, plus both sets of
seconds while panning. ~68 ms on 100 kHz I2C at 12 fps, nearly all of it the
full redraw a stateful driver would skip.

---

## `typist` — words, typed

`NINE / PAST TEN`, `QUARTER / TO ELEVEN`, `TEN O'CLOCK / IN THE MORNING`. On
the minute a block cursor backspaces over what changed and types the new
words at an uneven, human pace, then blinks. The common start of each line is
kept, so 10:09 -> 10:10 retypes one word.

Every keystroke holds 110 ms or more, so letters land rather than flicker.

**0 tiles.** The words and the cursor (0xff) are ROM.

---

## `abacus` — the time as an instrument, not a font

Four rods across both character rows, one per decimal digit of HH:MM. A rod is
one cell wide and sixteen tall, which is exactly the two character rows, so it
reads as one piece of glass. The digit is not drawn anywhere: it is the
*position* of the beads, one heaven bead above the reckoning bar worth five and
four earth beads below it worth one each, as on a soroban. The bar runs on
between the rods as ROM `0x5f` (a full-width rule on row 6), which is what makes
four columns into one instrument.

Each rod drawn as its own picture is two tiles, and four rods is exactly eight
slots, so the frame can never want more than the page holds. When a digit turns,
every bead on that rod slides to where it now belongs over 0.35 s; the digit it
turns *from* is read off the clock, never assumed.

**Up to 8 tiles.** ~42 ms on 100 kHz I2C, 10 fps.

## `morse` — the clock is a beacon

A station keying its own time. A lamp flashes the four digits of HH:MM in Morse
and a tape underneath takes them down, one symbol per cell, scrolling when it
fills. A dot holds one unit, a dash three, and the lamp is dark between them:
that timing is the only thing on the glass that a viewer cannot read but a
listener could.

Almost everything is ROM and free -- dot `0xa5`, dash `0x2d`, spaces for the
gaps -- so the whole tape costs nothing. CGRAM is spent only on the lamp, lit
and dark, two tiles. It is the clearest case of the rule that ROM is free: a
design whose entire animation is factory characters.

**2 tiles.** ~21 ms on 100 kHz I2C, 12 fps.

## `moon` — real astronomy, and the free grey

The left four cells are one 20x16 canvas holding the real Moon at its true phase
for the date, computed from the Julian date against a known new moon. The
terminator is an ellipse whose horizontal semi-axis is R times the cosine of the
phase angle, and the lit side is the right one while it waxes and the left while
it wanes. It is drawn in millimetres off the real dot pitch, as `dial` is, or
the disc comes out a tall oval with a kink at every cell seam.

The dark limb is a checkerboard rather than blank. That is two things at once:
the earthshine that makes the whole circle visible when only a sliver is lit,
and the hardware's missing third tone, borrowed from the lattice itself. The
canvas is redrawn every frame, so stars twinkle round it for nothing.

**Up to 8 tiles.** ~42 ms on 100 kHz I2C, 10 fps.

## `strike` — the hour, in the gap where the colon goes

The reference block face cut in two: the hours fill the left six cells, the
minutes the right six, and the four cells between them are a window with a
pendulum in it. That gap is the idea -- every other block clock puts a colon
there.

The pendulum is a true seconds pendulum: its period is two seconds, so it passes
the middle on each tick and the swing *is* the seconds readout. The rod is drawn
as one dot per row, the dot nearest the line at that row, because the two cells'
dots do not line up with any angle and a distance test drops the whole rod when
it hangs vertical between them.

On the hour it rings: the amplitude more than doubles and rings expand from the
pivot, one a second, for as many seconds as the hour struck twelve-hour time.
Nothing else on the glass marks the hour.

**8 tiles, exactly.** ~42 ms on 100 kHz I2C, 12 fps.

## `phantom` — the free grey, in time

A 12-hour seven-segment LCD with the unlit segments faintly visible, as on
the real thing. Every third frame at 60 fps lights every segment, the colon
and both AM and PM. The glass never gets that one frame above about 40%
contrast, so they settle near a third: a ghost 88:88 behind the time. Where
`moon` borrows its grey from the lattice (a checkerboard), this one borrows
it from the glass's lag.

The eight tiles never change, so they are written once in `setup`, as
firmware would at power-on, and a frame is only the 32 cell codes: 13.6 ms on
100 kHz I2C, which is what allows 60 fps. The grey is the renderer's linear
model; real liquid crystal responds to RMS voltage, so `GHOST_EVERY` needs
setting on the bench. `tile-budget` reports 4 slots because its sample
instants all land on ghost frames; the face uses its fixed 8.

**8 tiles, static.** 13.6 ms per frame.

## `invaders` — the cannon updates the time

The digits are invaders on little legs, marching side to side a cell a step
and speeding up as the minute runs out (0.8 s a step at :00, 0.3 s at :59;
the step count has a closed form, so any instant renders). On the minute the
cannon lines up under the digit that changed, leading it, and fires; the
digit explodes and the new one beams in. 10:59 -> 11:00 is three shots, right
to left, each digit keeping its old value until it is hit.

Whole-cell marching keeps the digits at four tiles. The cannon and its beam
move dot by dot through `Stage`, over a ROM underscore ground line.

**Up to 8 tiles.** ~35 ms on 100 kHz I2C, 12 fps.

## `warp` — a free starfield

Tall seven-segment digits with stars streaming out from them in ROM: 0xa5,
'+', '*' in order of size, accelerating outward a whole cell at a time. Over
the minute stars live shorter and come faster. At :00 they stretch into 0xb0
streaks, the field whites out with 0xff while the digits change, and the
streaks drain away.

The first render put stars in the cells next to the digits, where a dot read
as punctuation ("10:09:"). Those cells stay dark now, and the colon is ROM
':', which no star uses.

**8 tiles at most**, all on the digits. ~42 ms on 100 kHz I2C, 12 fps.

## `telegraph` — Morse, as a printing telegraph

`morse` with the roles swapped: here the tape is the transmission and the
bottom row is the receiver's print-out. At :00 the key sends the minutes (the
whole time on the hour), at :30 the date. Marks are inked at the right end of
the tape and scroll left one unit per 200 ms cell; a dah is three cells of a
full-width bar that joins across the cell gaps. A lamp lights while the key
is down, and each character prints when its last element arrives.

The first version kept the old digits until they were overwritten, so 10:09
-> 10:10 passed through 10:19, a time that never happened. A field now clears
to underscores when its message starts.

**2 tiles** (dit and dah). ~21 ms on 100 kHz I2C, 10 fps.

## `cuckoo` — the hour, with a bird

A chalet in the left three cells, redrawn each frame: a gable with the
bird's door, a dial whose minute hand points in eight directions, a pendulum
swinging once a second, two pine cones. On the hour the bird slides out in
profile into two more cells and calls the hour, CUC- then KOO!, one call a
second, printing a dot per call. On the half hour it calls once.

A first draft drew the bird front-on over the house, and it read as clutter.
In profile beside the house it reads as a bird.

**6 tiles, 8 while the bird is out.** ~42 ms on 100 kHz I2C, 12 fps.

## `soroban` — beads, with the beam in ROM

The same instrument as `abacus`, built differently: the beam is on dot row 3
so that it carries on across the gap between the hour and minute rods as ROM
0xb0, the frame ends are ROM blocks, and the label is ソロバン in the ROM's
katakana. Beads slide one row per 150 ms.

**8 tiles at most**, two per rod. ~42 ms on 100 kHz I2C, 12 fps.

## `frog` — a portrait, and a day in its life

The owner's avatar, a rainbow frog in round glasses, adapted to 20x16 dots:
the left four cells, all eight tiles, with the clock in ROM. Colour is gone,
so the likeness rests on the outline: a wide round body (an ellipse sampled
in mm, outline = the dots just inside it), two 5x5 lenses each exactly one
cell so no gap cuts a lens, lashes up and out, lips right of centre on a long
mouth line, four legs with splayed toes. A checkerboard body fill was tried
for the rainbow and dropped: it buried the lips.

Because the whole canvas is paid for, everything inside it is free, so the
frog keeps frog hours. By day it tracks a fly, blows a kiss at :30, flicks
its tongue up to catch the fly at :58.6 (about one minute in seven the fly
dodges: HMPH.) and croaks RIBBIT! with a puffed throat at :00. On the hour it
hops instead: crouch, out of the top of the glass, back down, splat. The hop
moves the picture by whole dot rows inside its own canvas, so it costs
nothing, and its squash takes out cheek and knee rows rather than rescaling,
which garbled the lenses. At night it sleeps: closed eyes, a belly that
breathes (the throat sac was tried and looked like the croak), z's drifting
along the date row, a fly asleep on its cheek, one eye cracked open each
minute. It yawns at 23:00 and wakes with a stretch at 07:00.

**8 tiles, always.** ~42 ms on 100 kHz I2C, 10 fps.

## `claude` — a logo, measured

The Claude spark in a 15x16 canvas. The first version was drawn from memory,
twelve thin rays evenly spaced round a dot with a gap, and the owner said it
did not look like the mark. It read as an asterisk. The rebuild renders the
symbol (Wikimedia Commons, "Claude AI symbol.svg") and measures it: each ray's
angle and reach from the centroid, and its width part way out. The rays are
not evenly spaced (82 and 104 degrees nearly pair, so do 134 and 150), their
lengths vary by 13%, they widen towards a round tip, and they meet in a solid
centre about a quarter of the radius across.

Area-sampling the symbol straight onto the dots was tried and gave the right
mass but broken rays: two cell gaps cut every diagonal. What reads is a model:
each measured ray as a tapered bar (0.5 to 0.95 mm), plus the dot nearest each
point of its centre line so a gap never breaks it, and a 1.5 mm solid hub.
`out/claude-vs-mark.png` has it beside the symbol. A larger hub turned the
middle cell into a solid square; a thinner root broke the centre up.

Beside it, the CLI's status line: a one-tile spinner blooming · ✢ ✳ ✶ ✻ ✽
and back (200 ms a glyph), a whimsical verb, a one-cell ellipsis tile, and the
time on a "> " prompt. While it thinks, a wave trims each ray by about a dot
in turn (rotating the mark re-aliases every ray, a shimmer). At :00 it pulls
in and bursts out, and the line says what the minute was spent doing.

**8 tiles**: six spark, spinner, ellipsis. ~42 ms on 100 kHz I2C, 10 fps.

## `chat` — two characters, two canvases, and ROM speech

A robot and a ghost at either end of the glass, each its own 10x16 canvas
(two cells by both rows, four tiles each: all eight), talking about the time
in ROM text across the ten cells between them. It is laid out like a chat
app: the robot's lines on the top row from the left, the ghost's on the
bottom row against the right, so position says who is speaking, and the
speaker's mouth flaps while the line types out at 120 ms a character.

The minute is seven exchanges of eight seconds; every other one has the time
in the answer (the time, the seconds so far, the seconds left counting down
live), the rest are banter, some hour-aware. At :00 both turn to the viewer
and shout the new minute. The robot is an outline and the ghost solid, so
they never read as the same sort of thing; the ghost's eyes are dark sockets
with a lit pupil, which is what lets it look at the robot, at you, or blink.
The first layout ran 12-character lines right up to the sprites and the text
merged into them; a blank cell either side fixed it.

**8 tiles, always.** ~42 ms on 100 kHz I2C, 10 fps.

## `cat` — a character who lives in the room, and gets up on the hour

A black cat asleep beside the clock. All hour it breathes (the top of its back
rises and falls every two seconds), an ear twitches, its tail tip flicks, and
z and Z drift up in ROM. At :05, :25 and :45 a mouse creeps in along the
bottom row; one eye opens and watches it until it runs. On the hour the cat
wakes, yawns, stretches (rump up, front legs out), walks to the clock, bats
the first digit so it jiggles, meows the hour with a count on the bottom row,
then walks back, circles and curls up again.

The anatomy is laid out on the cells, not across them: the head is always
exactly one cell, so the gap between cells is the line of the neck instead
of a cut through the face, and every pose is placed at a multiple of five dots
so the head stays on a cell as the cat walks. It is drawn dot by dot through
`Stage`, so only the cells it covers take slots; the batted digit is a
shifted copy of its ROM glyph. A cat drawn freely across the gaps read as a
blob, and an outline cat was too thin at 1:1: a filled silhouette on the
cell grid reads at a glance.

**6 tiles asleep, 8 with the mouse, up to 7 while it bats.** ~42 ms on 100 kHz
I2C, 10 fps; every pose holds 400 ms or more.

## `garden` — the day as a life cycle

A tulip in a pot grows through one day in a 15x16 canvas (six tiles). It
starts as a seed at midnight, sprouts and grows blades through the morning,
and is in bud by 08:00. It opens by noon, nods and drops a petal an hour
from 17:30, and turns into a dandelion clock whose eight seeds blow away one
at a time from 22:00. Something has visibly grown every few minutes. Between
changes it leans in the breeze and a bee loops round the bloom. The sun is a
`Stage` sprite that rises at 06:00, peaks at noon and sets at 18:00 across the
sky row, a dot every ten minutes: an hour hand. Stars, birds (`v`/`^`, which
flap because they sit at different heights) and the seeds out in the sky are
ROM.

A daisy drawn in mm was tried first. At this size its petals sat exactly in
the gaps between cells and it read as a box, so the head always fits inside
the middle cell, which no gap crosses. A tulip, a cup with three tips, is the
flower that shape suits. One-dot diagonal leaves read as noise; blades rising
from the soil read as a plant. Falling petals had to drift out past the blades
or they vanished into the stem.

**8 tiles at most** (six canvas, 1-2 sun). ~42 ms on 100 kHz I2C, 10 fps.

## `runner` — one shared tile scrolls the whole floor

The offline dinosaur game across the glass. A dinosaur runs at the left,
cacti come in from the right edge and it jumps each one, high into the top
row; the time is the score, top right, in ROM. Each minute a bird flaps in
level with its head and it ducks, while HH:MM flashes like the game's score
at a milestone. On the hour it misses: G A M E  O V E R fills the top row,
the world freezes for 2.6 s, and it restarts with the screen cleared.

The floor is one tile in all sixteen cells, a line and a speck whose phase
moves a dot a frame, so the whole width scrolls for one slot (the `tide`
trick). The dinosaur is two tiles; cacti and the bird are inked with `Stage`,
two cells each, and the schedule allows two at a time. Jumps are centred on
each cactus and sized to its height; a frame-by-frame check over a day
proves nothing is touched except the cactus on the hour. A fixed 8x1 strip
was tried first and dropped: cacti popped in mid-floor at its edge. Sprites
sit in dot columns, not glass columns, because a cactus that lost its trunk
to a cell gap was two loose dots.

**Up to 7 tiles** (checked on every frame of a day). ~39 ms on 100 kHz I2C, 7 fps.

## `aquarium` — the screen follows the sprites

The eight tiles need not be a fixed rectangle. Two fish swim round the whole
glass, through the clock, drawn dot by dot with `Stage`; only the cells under
a fish take slots, as private copies of the ROM text there. An 8x5 fish
covers at most 2x2 cells and a 5x3 fish the same, so two fish fit at any
position.

The rest is ROM: the time, seaweed that sways by alternating ( and ), sand,
and bubbles (o, then 0xa5 higher up). The degree sign was the first choice
for the small bubble and was dropped: beside the seconds it read as a
temperature. At :00 the big fish runs along the top row and each digit flips
as its nose passes.

**Up to 8 tiles.** ~35 ms on 100 kHz I2C, 12 fps.

## `flashcard` — one custom character, thirty-two copies

Every cell holds code 0, so the glass is one 5x8 picture repeated, and the time
is told as a deck of cards: hours tens, hours ones, a colon, minutes tens,
minutes ones, then a field of single dots that means "again". A digit repeated
across 32 cells reads from the far side of a room. The deck is six seconds
and starts on a multiple of six, so it never straddles a minute.

Each card holds 700-900 ms; between cards the slot is redrawn blank for 200 ms
so 11:11 is seen as four cards. Minute cards are underlined on the eighth dot
row, which no ROM glyph can light, so the glass shows ruled lines under every
minute digit. Even the dark gaps are the custom slot: no factory character,
not even the space, ever appears (`romFree: true`, checked by `tile-budget`).

**1 tile.** ~17 ms on 100 kHz I2C, 10 fps.

## `wallpaper` — a clock you read as a textile

The one picture is a 5x8 BCD clock: hours tens and ones, a one-dot spine,
minutes tens and ones, each digit in binary with two-dot-tall bits (bottom
pair 1, then 2, 4, 8 upward). Tiled 32 times it is a woven pattern first and a
clock on inspection; it changes once a minute. One-dot bits were tried and
could not be told from the spine once tiled.

The seconds are the hardware cursor, which is not a ROM character: an
underline that walks the cells two seconds at a time, top row then bottom. A
steady underline merged with the pattern's bottom bits, so the design turns it
on and off each half second and the tick finds the eye; the controller's own
blinking block is bolder but keeps its own rate, not the clock's.

**1 tile.** ~18 ms on 100 kHz I2C, 4 fps.

## `beads` — an abacus of two pictures

Every cell is a bead or bare wire. The top wire holds 12 beads and a gap of 4:
the beads left of the gap are the hour. The bottom wire holds 11 beads and a
gap of 5: the beads left of it count the fives of minutes, and an underline
cursor walks across the gap for the minutes between, a bead following it over
when it reaches the far side. Counts change by sliding, 200 ms a cell, the
whole group at once when the hour wraps.

A binary layout was dropped on paper: with two pictures and no factory space
there is no separator, so groups cannot be told apart. Counting needs none; the
bare wire is the separator. The wire is one tile shared by every bare cell, so
the seconds pluck it: for half of each second it bows a dot, along both wires
at once.

**2 tiles.** ~22 ms on 100 kHz I2C, 10 fps.

## `tally` — four slots, no ROM, and a mark that fits the cell

The hours and minutes as tally marks scratched on a stone wall, hours on the
top row and minutes below, with no factory character anywhere: the bare wall
is a slot too. Four pictures make the whole glass: the wall (two pits a
cell), a finished group, the hours' unfinished group and the minutes'. Each
new stroke is scratched in a dot every 200 ms in stroke order; when a count
starts over, the wall is scrubbed clean a group at a time, newest first.

The group is 正, the Chinese tally mark: five strokes that fill a 5x8 cell
exactly, its partial forms the familiar 一 丅 下 止. The prison tally of four
strokes and a diagonal was the brief, and it cannot be drawn: four strokes
kept apart need seven dot columns. Pits scattered among the strokes joined
them up, so a cell with a mark in it is scratched smooth.

**4 tiles at most, no ROM.** ~28 ms on 100 kHz I2C, 10 fps.

## `pure` — block digits in the rain, and the negative ROM can't do

The `hourglass` block digits with no factory character on the glass, so the
solid block and the blank are slots like the bars: three to five, never
more. The blank is spent on rain, a two-dot streak falling a row every
200 ms in every empty cell and in the empty part of every bar, which under
the glass's lag reads as drizzle. The separator costs nothing: it is the
controller's underline cursor, in the top row's bottom dot row, a dash at
the exact middle of the digits that blinks each second.

On the minute every slot is written inverted, twice, 250 ms then 350 ms:
lightning. In negative the cell gaps stay dark, so the lit sky is a lattice
and the digits are silhouettes; a single 0.6 s inversion read as a glitch,
the double flicker over the rain reads as weather.

**5 tiles at most, no ROM.** ~32 ms on 100 kHz I2C, 10 fps.

## `fullhouse` — HH:MM:SS on exactly eight slots

Every cell is a slot: each distinct digit, the colon and the blank. 01:23:45
has six different digits, so the worst second of the day uses all eight and
cannot use a ninth; there is no room for a digit transition, so the digits
just change. A sweep of every second of the day confirms it never overflows.

Owning the blank, the face spends it on the seconds again: one dot per blank
cell, all 24 stepping across their cells together a column every 200 ms, so
the whole glass ticks over once a second. The colon beats on the same tick,
big, a cross, then small. The digits use all eight dot rows, two-dot
verticals and one-dot bars, which no ROM digit does.

**8 tiles at the worst second, no ROM.** ~42 ms on 100 kHz I2C, 10 fps.

## `solo` — one numeral, and the tide is the seconds

The hour, and nothing else written: one block numeral (the `hourglass` kit;
10-12 with a narrow flagged 1) standing in the middle of the glass like a rock
in the sea. Over each minute the tide comes in a dot row every five seconds,
up the glass and up the rock, until only its top is dry at :59; at :00 it goes
out in a two-second rush and the new hour, on the hour, emerges as it drops.
The minutes are a sailing boat riding the tide: left edge to the rock for :00
to :29, the rock to the right edge for :30 to :59. It sails behind the rock at
half past, and round the edge of the glass on the hour. At night ROM stars
twinkle in the open sky until the water reaches them.

The sea's pattern (a swell line, a ripple every third row) repeats every five
dots, so all sea cells in a row are one tile and the waves move by shifting
it; a dry row is ROM blank and a drowned one a single deep tile. The rock's
solid cells are ROM 0xff in any water. Three rules hold it to eight tiles at
every tenth of a second of the day: the boat touches two cells across at most,
its bob never takes the hull into the next row, and the swell never crosses
the row boundary. A full top bar on the narrow 1 read as a 7, denser water hid
the rock, and a one-dot halo lost the boat at high tide; a box of calm water
round it reads.

**Up to 8 tiles.** ~42 ms on 100 kHz I2C, 10 fps.

## `totem` — the module on end, the time stacked down it

Portrait (`rotate: 90`): HH over MM, four digits the full width of the glass
(16 dots, 11.5 mm) and four viewer cells tall (20 dots, 13.6 mm), the largest
a digit can be when four share sixteen cells. Every digit is built from a
kit of seven parts on the viewer cell grid: top bar, bottom bar, middle bar,
left stroke, right stroke, and a stroke meeting the middle bar on each side.
A cell holds at most one stroke, because each stroke lives in its own viewer
column, and the bars are the same tile on both sides, so the whole kit is
seven tiles: no time, and no frame of a transition, can want more. The bars
sit against the cell seams so the seam is the only break between bar and
stroke, and the blank rows above the top bar and below the bottom bar keep
stacked digits apart.

Three-cell digits were tried first to leave room for a colon and seconds.
With bars that are not whole cells every cell mixes bar and strokes, the kit
grows to fifteen parts and 10:09 alone needs nine, so the stack itself is the
separator. On the minute the digits roll like an odometer, a cell per 200 ms,
the carry rippling upward 0.35 s per digit.

**7 tiles, worst.** ~39 ms on 100 kHz I2C, 10 fps.

## `thermometer` — the seams are the scale

Portrait: a mercury thermometer down the left viewer column, rising one dot a
minute, so each cell is five minutes and the cell seams are the graduations.
Five-minute ticks sit on the left; the quarter-hour marks on the right are ROM
`|` seen sideways, a seven-dot line across a cell, free. The minute rides up
beside the column top as a 3x5 pair with a pointer notch; the hour sits by the
round bulb, drawn in mm. The seconds are a heartbeat: the dot above the
mercury pulses each second for longer and longer, filling in just before it
is counted. On the hour the column drains a cell per 180 ms while the pointer
counts down.

The thermometer is one 8x80 picture cut into cells, so identical cells share:
cap, empty tube, full tube, one partly filled cell and two bulb cells, six at
most, because the pulse dot always lands in the partly filled cell or above a
full one. Scale numbers as 3x5 pairs cost three tiles and were dropped for
the pointer. No ROM glyph seen sideways lights a cell's edge rows, so the
scale is offset half a cell to put the marks where `|` draws them.

**8 tiles, worst.** ~42 ms on 100 kHz I2C, 10 fps.

## `candle` — a candle clock, stood on its end

Portrait (`rotate: 90`). A taper in the right-hand viewer column burns down a
dot a minute: full at :00, a one-dot stub at :59. The glass's seams, a missing
dot row every five, cross it at every fifth minute, which is the graduation a
real candle clock has painted on it. The flame flickers through slender
three-dot shapes held 180 ms or more; once a minute a bead of wax runs down the
side and joins a puddle that spreads along the saucer; the flame gutters
through the last minute. On the hour the stub goes out in a wisp of smoke, a
fresh candle is lowered in a cell at a time, and a match comes in and lights it.

The candle is exactly one viewer column wide, so every full cell of it is ROM
0xff; only the cell with its top in it is a tile. Centred across both columns
it looked better on paper and needed eleven tiles. Five-dot flames were squat
diamonds (portrait dots are 0.70 mm across but 0.60 mm down), and a puddle
that climbed the candle's side was a ninth tile: it spreads along the saucer
row instead. The time is two 3x5 digit pairs, one tile each.

**8 tiles at most** (time 2, saucer 2, candle top 1, flame 1-2, drip 1). ~42 ms
on 100 kHz I2C, 12 fps.

## `rocket` — one flight an hour, past free stars

Portrait. A rocket climbs the right-hand column through the hour, its altitude
the minute, past stars streaming down in four ROM layers at four speeds ('.',
0xa5, '+', '*'). They step a whole cell at a time and the lag smears the fast
ones into streaks, so it always reads as flying though the rocket rises only a
dot every minute and a half. At :30 the booster separates and tumbles away;
from :40 the Moon comes into view; at :59:20 the rocket leaves the top of the
glass. Then the pad: ROM '#' on its side is a lattice gantry, '|' on its side is
the ground, a countdown tile runs from :59:50, and at :00 it lifts off in 'o'
and 'O' smoke while the gantry drops away.

Everything that steps by cells is ROM read sideways; CGRAM goes on what moves
by dots. The rocket is eight dots wide, one viewer column, so it never pays for
both columns: three or four tiles with its flame. The time is two 3x5 pairs.

**Up to 7 tiles.** ~39 ms on 100 kHz I2C, 12 fps.

## `calibrate` — a test card for the bench

Not a clock: a card for checking the simulator against a real module. The top
row is eight patches made by alternating frames: solid, 3/4, 2/3, 1/2, 1/3,
1/4, a checkerboard and its complement in alternate frames (the same average
as 1/2, but half the dots lit every frame, so the flicker should cancel), and
a static checkerboard. The bottom row switches ROM blocks at 1 s, 0.5 s,
250 ms, 125 ms and every frame, with solid and blank references, and the
seconds in ROM so a photo can be matched to a time.

The simulator says the patches are a linear ramp and the every-frame toggle a
steady grey. On glass the ramp bends with the contrast pot, the rise and fall
in the 1 s cell may differ, and the fast toggles may beat with the
controller's own refresh. Film it in slow motion, compare with the render, and
tune the designs that use greys (`phantom`, `greyfrog`, `glide`, `sixteen`).

**7 tiles.** ~39 ms on 100 kHz I2C, 24 fps.

## `greyfrog` — the rainbow, as a third tone

`frog` with its body filled in grey, by time-division multiplexing: every
frame alternates between two CGRAM pages. The outline, glasses, lips, legs,
fly and tongue are lit in both phases, at full contrast; the body's fill dots
are lit in one phase only, so the glass settles each at about half contrast.
The fill is split into complementary patterns, so each phase lights the same
number of dots and the body's average brightness holds steady while the dots
alternate. Two densities shade it like the avatar's gradient, as luminance:
the red left and violet right at 50% (a checkerboard, colours swapped each
phase), the yellow-green middle at 25% (one dot in each 2x2, opposite corners
per phase). A clear dot round the lips keeps the face readable: the
full-contrast fill `frog` dropped buried them, and half contrast does not.

Each phase is a full page of eight tiles, so the budget is `frog`'s and only
the bus changes: declared for an 8-bit parallel bus at 60 fps (4.5 ms a
frame), the phases alternate at 30 Hz and the grey ripples about 12% on the
lag model, a shimmer. On 100 kHz I2C a page is 42.4 ms, so the phase rate
falls to about 20/s and the dots flicker visibly, about 35% at 10 Hz. On
glass the grey's level depends on the contrast pot: the simulator averages
linearly, the crystal does not. A 4-phase version for finer levels was not
built: one phase in four ripples about 18% at 15 Hz even at 60 fps.

**8 tiles per phase, 2 phases.** ~4.5 ms per frame on 8-bit parallel, 60 fps.

## `sixteen` — two CGRAM pages, and what they cost

Four drawn 10x16 digits with curved bowls, four tiles each: HH:MM wants up to
sixteen distinct tiles, and one page holds eight. The design alternates two
CGRAM pages every frame at 60 fps and lets the glass average them. A tile in
both pages is lit all the time and reads at full contrast; a tile in one page
is lit half the time and settles near half contrast with a ripple at the page
rate. So each frame a planner puts every distinct digit in both pages, in A
only or in B only, tries all 3^n ways that keep both pages at eight tiles or
fewer (quarters two digits share, like the bottom right of 3, 5, 6 and 8,
count once), and scores full digits first, then ink balanced between the
pages, then neighbours in opposite pages. A repeated digit is the one to
promote: 10:09 shows its 0s full. Across the day all four are full for 128
minutes, two for 668, none for 631. On the minute a turning digit
double-exposes, old in A and new in B, for 0.5 s if both pages have room: a
dissolve.

Hours in A and minutes in B was the obvious plan, and puts every digit at
half contrast all day. Promoting single tiles lights more dots but splits
digits into bright and dim quarters, which reads as broken type.
Complementary dither for the dim digits would stop their flicker as a block,
but it needs their tiles in both pages, which is the capacity TDM was meant
to free. On glass: ~12% shimmer at 30 Hz on a parallel bus, ~33% flicker at
10 Hz on 100 kHz I2C (20 fps is all that bus allows); the half-contrast grey
is a linear average here and depends on the contrast pot in reality; pages
are not synchronised to the controller's scan, so frames can tear. See
`hardware.md`, "Time-division multiplexing".

**8 tiles per page, 16 across two.** ~4.5 ms per frame on 8-bit parallel, 60 fps.

## `glide` — a sweep second, by time-division

TDM spent on smoothness instead of on more glyphs. A sweep-seconds dial in
cells 0-2 (six tiles): twelve crisp marks and a long hand with a counterweight
tail, drawn in mm. The hand is never snapped to dots. Each frame every dot's
coverage is measured (4x4 samples over its pitch cell) and the dot is lit in
that fraction of four frames, ranked by a 2x2 dither so neighbouring greys take
turns, and handed out in bit-reversed order (0, 2, 1, 3) so a half-lit dot is
on in alternate frames: 44-56% ripple on 150 ms glass at 60 fps, not 38-62%.
The hand stays straight at every angle and moves continuously, where `dial`'s
hands staircase and their kinks jump (`out/glide-compare.png`). The time is
ROM at full contrast; the same trick on DDRAM costs nothing, so the colon
breathes and changing digits cross-fade 3:1, 1:3 over 1.2 s.

Anti-aliased hour and minute hands merged into a blob at the hub, as `dial`'s
did in whole dots, so the dial is seconds only; static marks stay crisp,
because a grey that never moves only flickers. The digits in a cross-fade
share one rank: per-digit ranks put times that never happen ("10:00") into
single frames. It needs the bus: 3.75 ms a frame on 8-bit parallel at 60 fps;
on 100 kHz I2C (35 ms, 28 fps max) use `makeGlide({ phases: 2, fps: 25 })`.
On glass the greys follow the contrast pot, not a straight line, so the glide
may step more than simulated, never worse than whole dots.

**6 tiles a frame, four frames a cycle.** 3.75 ms on 8-bit parallel, 60 fps.

---

# Desk toys: animations with no clock

These six don't show the time. Each is driven from the time of day
(`h*3600 + m*60 + s`), not `ctx.t`. That keeps the live view continuous, and it
means `tile-budget`'s day sweep reaches every phase of the animation. Each one
was also checked frame by frame, at its own fps, across at least one full
cycle.

## `cradle` — a desk toy, and ROM that is already a picture

A Newton's cradle. A cartoon glove (cuff, fist, pointing finger) pulls one,
two or three balls out, or a finger flicks the end of the row. The same
number fly out at the far end, the swing decays over a minute, the row
shivers as one the way a real cradle goes muddy, and then it hangs still
until the next round. Six rounds make a 12-minute cycle. The bar and resting
strings are ROM `'T'`, five in a row. A resting ball is one shared tile. A
swinging ball is the same 5x5 glyph, shine included, stamped in dot columns,
so over a cell gap it keeps its width and shows a seam. Inked in glass
columns it lost a column and read as a half-moon, and drawn smaller it read
as a different object from the balls at rest. Balls that swing together
share one angle and hang exactly a cell apart, so a moving group dedupes:
three cost about what one does. The balls hang low and never reach the top
row, because straddling the rows doubled their cells. Pulling two or three
balls out smoothly overflowed, so the glove jerks them out in one step and
the lag smears it.

**Up to 8 tiles.** ~42 ms on 100 kHz I2C, 10 fps.

## `lavalamp` — the module as a desk lamp

Portrait. A big blob of wax domes out of the pool, necks, pinches off and
rises. It spreads under the cap as it cools and sinks back. A smaller drop
runs half a cycle behind, so the two pass mid-globe and sometimes merge and
pull apart. Each 83 s trip gets its own lane, size and turning height, and
about a quarter turn back halfway. The wax is metaballs evaluated at the
real dot centres in mm. The cap, foot, ribs (ROM `|` on its side) and pool
are free, so only cells on a blob's edge take slots. Height decides the
budget: a row of cells is 3.55 mm, so anything taller than 7.1 mm can touch
four rows. The big blob is held under that and the small drop under 3.55 mm.
The first, taller teardrops snapped a cell to full or empty in 4% of frames.

**8 tiles at most.** ~42 ms on 100 kHz I2C, 8 fps.

## `ducks` — a family that moves a cell at a time

A mother duck and four ducklings visit a pond every 90 s. They come in along
the bank, a dawdler pecks and then scurries after them, they splash in, one
dives bottoms-up, a stray is called back with "QUACK!", and they go home.
Between visits a frog may croak and jump in, or a fish leap. From 21:00 to
06:00 they sleep in a huddle under a ROM sky. Ducks step a whole cell at a
time, so every duckling in the same pose is the same tile: four walking in
step cost two. The mother is three tiles. They set off 150 ms apart, front
first, which looks like following and means nobody steps into an occupied
cell.

**8 tiles at most**, checked on every frame of a day. ~42 ms on 100 kHz I2C,
10 fps.

## `orrery` — the sun is sacred

The solar system seen from a little above. A round eight-dot sun sits across
both gaps and takes four tiles, with rays that flare one at a time. Mercury
(a dot), Earth with its Moon, a 4x3 Jupiter and a ringed Saturn go round it
on flat ellipses with periods from Kepler, and each stays inside one cell,
so the frame never needs more than eight. Dots next to the disc are dropped
so the sun's edge never breaks, and a transit is one dark dot inside it.
Every 260 s a comet falls in, whips round with its tail streaming away from
the sun, and takes whatever slots are left, becoming ROM when there are
none. The first version had six planets, a 5x4 sun and transits cut as
notches. It read as scattered specks round a broken glyph, so Venus and Mars
went. A steady ROM star is a 2x2 block, the same as a planet, so the sky
stays dark apart from an occasional ROM '+' glint.

**8 tiles.** ~42 ms on 100 kHz I2C, 8 fps.

## `fireflies` — the glass's lag is the firefly

A dusk meadow. Seven fireflies wander, and only their flashes show: one dot
for 200 ms, a five-dot glow for 400 ms, one dot for 200 ms. The 150 ms lag
smooths those steps into a swell and a fade. Over a four-minute evening
their phases ease into step until the meadow flashes together in bursts of
three, as synchronous fireflies do, and then they drift apart. Twice an
evening a firefly is steered over a frog in glasses. The frog goes
cross-eyed and its tongue shoots straight up between its lenses: a miss, and
later a catch, a gulp, and a hiccup that lets the firefly go. The frog is
fifteen dots wide with its lenses on top. Ten dots wide, it read as an owl.
Its two lenses share one tile whenever the pupils agree. While in step,
flashes snap to fixed spots in their cells, so any number of them cost three
tiles, and a flash that would need a ninth slot stays dark. Two fireflies in
one cell merged into a dagger, so it is one per cell.

**8 tiles at most.** ~42 ms on 100 kHz I2C, 10 fps.

## `dvd` — the corner, as number theory

The screensaver logo, waiting for the corner. A 15x8 disc logo moves a dot
every 200 ms in dot columns, so the gaps never cut a letter. Its corner
travels a 65 x 8 lattice, and because 65 and 8 are coprime it meets two
walls at once only after 520 steps. On the way it touches the side walls at
1, 2, 3, 4, 3, 2, 1 dots from a corner, so the near misses build up on their
own and ROM calls them out ("so close!"). The eighth arrival is an exact
corner hit: three solid flashes (0xff, logo cut out), CORNER!, confetti, and
a count of today's hits. It can't change colour, so the disc swaps between
solid and a ring at every bounce and squashes for one step against the wall.
A negative logo lost its letters, and a 17-dot logo covered five cells. The
cycle is 112.5 s, which divides the day evenly.

**8 tiles at most, 4 in the corner.** ~42 ms on 100 kHz I2C, 10 fps.

## Where the room is

Nothing shipped has tried these yet:

- **The eight tiles as a screen, in other shapes.** Shipped: 4x2 (`frog`,
  `moon`), 3x2 (`claude`, `cuckoo`, `garden`), two 2x2 (`chat`), sprites
  that roam (`aquarium`, `cat`) and one tile repeated across the glass
  (`runner`). Still open: a true 8x1 strip used as a landscape, and canvases
  that change shape during the hour.

- **Display shift**, beyond `carousel`'s pan. A marquee, a slow drift, a
  40-cell panorama. Remember it moves both rows together.
- **The ROM's symbols.** Arrows (0x7e/0x7f), and 0xE0-0xFF: Greek, maths,
  ∞, Ω, Σ, π, √. `morse` uses the katakana long dash and the middle dot, but
  the Greek and maths glyphs are untouched.
- **Time-division beyond the first tries** (`phantom`, `greyfrog`, `sixteen`,
  `glide`): none has been seen on real glass yet. Run `calibrate` on a module
  first; the greys may need re-tuning, and synchronising page changes to the
  controller's own refresh is unexplored.
- **Words**, beyond `typist`: other languages, one that says it differently
  each hour.
- **Two rows that disagree.** Every design treats the glass as one picture.
  The rows could be two different instruments.
- **The calendar.** `moon` is the only design whose picture changes with the
  date rather than the clock. Seasons, the week, the year's arc are all open.
- **The seconds and hours readouts.** Most are plain ROM labels. They could
  carry the design.

Covered since this list was written: **the hour** (`strike` rings it,
`cuckoo` calls it), **the free grey in time** (`phantom`),
**time that is not hh:mm** (`abacus`, `moon`), and **a drawn instrument rather
than a drawn font** (`abacus`).
