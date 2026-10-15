// Marbling (ebru): the glass is the marbler's size bath seen from above, and
// the time is written in floating paint.
//
// Each numeral is a stylus path (marbling-glyphs.js): the marbler drops a
// row of paint along it, white first (the pale moat of size round the
// figure), then a ring of oxblood, then ochre, with a cream eye in every
// drop, alternate drops ringed in indigo; then draws the stylus through the
// row, which pulls every drop into a heart pointing the way the line was
// drawn. So the digits are chains of nested hearts in a warm family, with a
// round drop where the line starts and a drawn-out tail where the stylus
// left the bath. The paint keeps creeping along each line, so the hearts
// travel slowly round the 0 and down the 1, and the ground's stones are
// pushed aside round every stroke, as dropped paint pushes what floats.
//
// The ground is the hour's bath (marbling-bath.js): cool stones (battal)
// with thin pale veins, drawn through by combs. At :00 the bath is plain
// stones; at every minute turn the comb is drawn down the whole bath once
// more, so the stones stretch into feathers (gel-git) as the hour goes on:
// the hour's progress is in the pattern. The surface never stops: the
// stones creep down through the feathers, the combs breathe, a wave rolls
// across, and now and then a soft band of reflected light slides over the
// wet size.
//
// Minute turn: from :58.3 a row of tines crosses the bath top to bottom.
// The leaving numeral is dragged down into feathers by the tines over it,
// drawn thin, and breaks up evenly like a film of paint until only the
// bath is left (gone by :59.6). After :00 the new numeral's drops fall
// along its path, evenly thinned at every moment (never one bowl first),
// each blooming open with a small ripple; by :00.5 it reads as a dotted
// numeral, and the stylus (a dark point) runs along it from :00.75 to
// :01.95, joining the drops and pulling them into hearts. The 7 is done in
// stroke order, since a half-dropped 7 reads '?': the stylus draws its bar
// at once, then its stem is dropped downward from the bar and drawn through.
// The time shown is never another number: old paint only leaves, new paint
// only arrives after :00.
//
// Hour: the print. The comb is drawn once more and harder; the old numerals
// feather and dissolve under it; a sheet of paper is laid on the bath from
// the left (the paint shows through the wet sheet); at :59.65 it is peeled
// off from the top left corner, the flap folding back flat to show the
// print on its face, mirrored; behind the fold is a fresh bath in the next
// hour's colours: its drops are sprinkled and spread into new stones, and
// the new numerals are dropped as soon as the fold has uncovered them. The
// glass shows no numerals for about 0.9 s round :00.
//
// Palette, ebru's own: earth pigments floating on a milky size. The time is
// one warm family, ochre body, oxblood and indigo hearts with cream eyes,
// an oxblood keyline and a moat of size; the ground is cool and calmer, four
// close stones per hour (indigo and turquoise, verdigris and sage, slate and
// lilac, aubergine and violet in turn) with pale veins, so the numerals are
// always the strongest contrast. Night (23-07) dims the backlight to 40 %
// and deepens the stones toward ink while the numerals keep their colour
// (the two palettes dissolve into each other over the fade minute).
// Hard pixels for the flat paint; every band edge is blended over one pixel
// from continuous fields, so the creeping hearts and stones glide by
// fractions of a pixel. AA only for the comb's tines and the stylus.
//
// Cost: one integer pass over the glass (marbling-face.js), no per-pixel
// callbacks. Per pixel: the slot that owns its column, the comb inverse (a
// few 1D tables) and a read of the stone tile, and near a stroke its path
// coordinates from the slot's map turned into rings with a sqrt table;
// everything ends in one colour-table lookup. The work is counted as it is
// done, in integer ops, and charged to g.cost.box; the expensive moments are
// cut back on purpose: drops are tested against a per-frame table of their
// radii, under the wet paper the stones are drawn without veins or push, and
// the paper rolls on in row runs.
// Off the canvas, all built on the device, nothing shipped but code:
//   stone tile        128 x 128 x (stone, edge) bytes          32.0 KB  (boot, ~0.5 M ops)
//   colour tables     12 colours x 12 x 8 blends x 4 sheen     9.2 KB a bath table;
//                     paper, shadow, print 2.3 KB each; one bath table at rest,
//                     two in the night-fade minutes, at the hour old + new bath
//                     + paper + shadow + print (+ the new night one at 23:00 / 07:00)
//   path maps         one buffer per slot, 5 B a pixel (rest distance, arc
//                     length, the stones' push): 16.7 KB an hour slot, 13.7 KB
//                     a minute slot, 60.7 KB for four. Rebuilt in place in the
//                     gap between the old paint leaving (:59.6, the hour :59.7)
//                     and the new drops (:00.05): up to 0.53 M ops a map, charged
//                     to those frames.
//   frame tables      comb, wobble, drops: ~3 KB per world, two at the hour
//   flash             sqrt bytes 1.6 KB, sine 4 KB
// RAM beyond the 25.6 KB frame buffer: ~107 KB at rest (~116 KB in the
// night-fade minutes), ~140 KB at the peak round 23:00 and 07:00.

import { frame } from './marbling-face.js';

export default {
  name: 'Marbling',
  blurb: 'An ebru bath: the time is drawn in floating paint as chains of hearts; the comb drags each old digit into feathers and the bath feathers through the hour; at the hour a sheet takes the print.',
  fps: 60,
  frame,
};
