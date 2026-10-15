// Type sheet: the lattice-native COMB digits on a hexagon or triangle, the
// STROKE digits on anything else. Cycles 0-9 so every glyph can be checked.
import * as kit from '../js/kit.js';

export default {
  name: 'Specimen', blurb: 'the fonts on the lattice: COMB on tri boards, STROKE elsewhere',
  layouts: ['hex', '*'], fps: 30, brightness: 0.4,
  frame(ctx) {
    const L = ctx.layout, k = Math.floor(ctx.t / 2);
    const tri = L.panels.every((p) => p.def.lattice === 'tri') && L.panels.length === 1 && L.panels[0].def.key === 'hex331';
    if (tri) {
      // four digits as a clock would place them: HH over MM on the hexagon
      const dx = 4 * Math.sqrt(3) / 2;
      const s = [0, 1, 2, 3].map((j) => String((k * 4 + j) % 10));
      const rows = [[s[0] + s[1], -30], [s[2] + s[3], 6]];
      for (const [txt, y] of rows)
        for (const g of kit.combText(ctx, txt, -5 * dx, y))
          for (const d of g.dots) if (d.i >= 0) kit.set(ctx, d.i, kit.hsv(0.11 + 0.05 * g.glyph, 0.85, 1));
      return;
    }
    const b = L.bbox, txt = String(k % 10) + String((k + 1) % 10) + ':' + String((k + 2) % 10) + String((k + 3) % 10);
    const h = Math.min(b.h * 0.7, (b.w * 0.85) / (kit.textWidth(txt, 1)));
    const w = kit.textWidth(txt, h);
    kit.drawStrokes(ctx, kit.strokes(txt, { x: b.cx - w / 2, y: b.cy - h / 2, h }), { width: Math.max(2, h / 7), color: [1, 0.85, 0.5] });
  },
};
