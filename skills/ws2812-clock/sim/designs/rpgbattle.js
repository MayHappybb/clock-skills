// Wyrm Battle: a 16-bit JRPG battle on four HUB75 panels (128 x 128).
// The HOUR is the enemy: two scaly wyrms, each coiled into the shape of its
// numeral (a 0 is an ouroboros, a 1 rears with its head as the flag). The
// MINUTES are the last hit's damage number, in a fat outlined damage face,
// hanging over the monsters. A party of three heroes (knight, black mage,
// monk) waits on the right; their ATB gauges fill in the window below, and
// whoever's gauge fills takes the turn: at each minute a hero runs in, hits
// the wyrm, and the new minute pops off it, bounces and settles. At the hour
// the party summons a phoenix: it dives, the screen flashes, the old wyrms
// burn to embers and the new hour's wyrms slither in along their numerals.
//
// Pure function of the wall clock: every pose is closed-form in the time
// since the nearest minute boundary.
import * as kit from '../js/kit.js';
import * as G from './rpgbattle-gfx.js';
import * as WY from './rpgbattle-wyrm.js';
import * as FX from './rpgbattle-fx.js';
import { HEROES } from './rpgbattle-heroes.js';
import { damageDigit, DMG, menuText, menuWidth } from './rpgbattle-font.js';

const { W, H, img } = G;
const pad = (n) => String(n).padStart(2, '0');
const cl = kit.clamp, E = kit.ease;
const lin = kit.hex;

// ---------------------------------------------------------------- layout
const HOUR_X = [2, 34], HOUR_Y = 7;               // wyrm cells, 30 x 60
const HIT = { x: HOUR_X[1] + 19, y: HOUR_Y + 40 };   // where heroes strike
const SC = 1.45, ADV = DMG.adv * SC;                  // damage number scale
const REST_X = 73, REST_Y = 10;
const HOME = [[95, 72], [117, 84], [100, 97]];      // heroes' feet
const MELEE = [[72, 68], null, [71, 72]];
const NAMES = ['KNIGHT', 'MAGE', 'MONK'], ACTS = ['SLASH', 'FIRE', 'KICK'];
const WIN_Y = 100, ROW = [104, 111, 118];
const TXT = lin('#f0f0f8'), TXTD = lin('#9aa4d0'), GOLD = lin('#ffd84a'), ATB = lin('#40e0ff'), ATBF = lin('#ffe84a'), ATBE = lin('#081040');
const HORN = lin('#f4e8c8'), PORTAL = lin('#b050ff'), EYE = lin('#ffe03a'), TONGUE = lin('#ff3050');

const P = { b: 0, st: 0, arm: 0, fl: 0, blink: 1, lean: 0 };   // one hot pose object
const ST = [0, 1, 2, 3].map(() => ({ flash: 0, burn: 0, glint: 0, L: 1 }));

// ------------------------------------------------------------ helpers
const bump = (u, a, b, c, d) => (u < a || u > d ? 0 : u < b ? (u - a) / (b - a) : u < c ? 1 : (d - u) / (d - c));
function blinkAt(t, i) { const ph = (t + i * 1.37) % (3.1 + i * 0.7); return ph < 0.13 ? Math.abs(ph - 0.065) / 0.065 : 1; }

/** Damage-number digit i at time u since its pop: box top-left x, y, scale, squash, alpha, flash. */
const DD = { x: 0, y: 0, s: 1, sy: 1, a: 1, f: 0 };
const GRAV = 290, H0 = 8, REST_E = 0.42;
function popDigit(i, v, fx, fy) {
  const rx = REST_X + i * ADV, ry = REST_Y;
  const T1 = 0.42;
  if (v < T1) {
    // thrown up out of the monster, growing, stretched by speed
    const f = v / T1, e = 1 - (1 - f) * (1 - f), s = 0.45 + 0.55 * E.out(f);
    const sx0 = fx - 4.5 * s + (i - 0.5) * ADV * 0.45, sy0 = fy - 8.5 * s;
    DD.x = sx0 + (rx - sx0) * E.inOut(f); DD.y = sy0 + (ry - H0 - sy0) * e;
    DD.s = s * SC; DD.sy = 1 + 0.3 * (1 - f); DD.a = cl(v / 0.06); DD.f = cl(1 - v / 0.35);
    return;
  }
  // then falls onto its line and bounces, squashing at each landing
  let w = v - T1, h = H0, y = 0, ls = 9, hit = 1;
  DD.x = rx; DD.s = SC; DD.a = 1; DD.f = 0;
  const tf0 = Math.sqrt(2 * h / GRAV);
  if (w < tf0) y = h - 0.5 * GRAV * w * w;
  else {
    w -= tf0; ls = w;
    for (let k = 1; k < 4; k++) {
      const hk = H0 * REST_E ** (2 * k), v0 = Math.sqrt(2 * GRAV * hk), dur = 2 * v0 / GRAV;
      if (w < dur) { y = v0 * w - 0.5 * GRAV * w * w; break; }
      w -= dur; ls = w; hit = REST_E ** k;
    }
  }
  const sq = ls < 0.1 ? (1 - ls / 0.1) * 0.3 * hit : 0;
  DD.y = ry - y; DD.sy = 1 - sq;
}

// the summoned phoenix's flight: behind the time, the sky its stage
const PH = { x: 0, y: 0, s: 1, a: 0 };
function phoenixAt(u) {
  let px = 0, py = 0, ps = 1, pa = 0;
    if (u < -2.2) { const f = cl((u + 4.6) / 2.4), e = E.out(f); px = 62; py = -50 + (72 + 50) * e; ps = 0.8 + 1.1 * e; pa = cl((u + 4.6) / 0.6); }
    else if (u < -1.25) { px = 62 + 2 * Math.sin(u * 3); py = 72 + 2.5 * Math.sin(u * 5); ps = 1.9; pa = 1; }
    else if (u < -1.0) { const f = E.in((u + 1.25) / 0.25); px = 62 + (34 - 62) * f; py = 72 + (44 - 72) * f; ps = 1.9 - 0.5 * f; pa = 1; }
    else { const f = cl((u + 1.0) / 1.6), e = E.in(f); px = 34 + (-50 - 34) * e; py = 40 + (-40 - 40) * e; ps = 1.2 - 0.5 * e; pa = 1 - f * f; }
  PH.x = px; PH.y = py; PH.s = ps; PH.a = pa;
}

// --------------------------------------------------------------- frame
export default {
  name: 'Wyrm Battle',
  blurb: 'JRPG battle: the hour is two wyrms coiled into numerals, the minutes are damage numbers; a phoenix summon at the hour',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.35,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, t = now % 7200;
    const d = ctx.date, hh = pad(d.getHours()), mm = pad(d.getMinutes());
    const b = Math.round(now / 60) * 60, u = now - b;
    const bm = new Date(b * 1000).getMinutes(), hourTurn = bm === 0;
    const bi = Math.round(b / 60), atk = ((bi % 3) + 3) % 3;
    const show = hourTurn && u > -5.2 && u < 3;

    // --------------------------------------------------------- the stage
    let dark = 0;
    if (show) dark = 0.55 * bump(u, -5.0, -4.2, 0.3, 2.2);
    img.set(FX.BG);
    if (dark > 0) for (let p = 0; p < img.length; p++) img[p] *= 1 - dark;
    FX.stars(t, 1 - dark);
    FX.fireflies(t, 1 - dark);

    // screen shake from the phoenix strike, and the hit recoil
    let shx = 0, shy = 0;
    if (show && u > -1.0 && u < 0.2) { const k = Math.exp(-(u + 1) * 4); shx = 2.2 * k * Math.sin(u * 83); shy = 1.4 * k * Math.sin(u * 61 + 1); }
    let recoil = 0, flash = 0;
    if (!hourTurn && u >= 0 && u < 0.8) { recoil = -3.2 * Math.exp(-u * 6) * Math.sin(Math.min(1, u / 0.05) * 1.57); flash = cl(1 - u / 0.22); }

    if (show) { phoenixAt(u); FX.phoenix(PH.x, PH.y, PH.s, u < -1.25 && u > -2.2 ? u * 4.5 : u * 9, PH.a, t); }

    // ------------------------------------------------------- the wyrms
    WY.clear();
    const heads = [null, null];
    // at the hour the old wyrms burn (u -1.0 .. -0.1) while the new ones
    // already slither in over them (u -0.55 .. 1.0): never both gone
    const prevHH = pad(new Date((b - 1) * 1000).getHours());
    const burn = show ? cl((u + 0.95) / 1.0) : 0;
    const emerge = show ? (u < 0 ? 0 : E.out(cl(u / 1.4))) : 1;
    const curHH = show && u < 0 ? pad(new Date((b + 1) * 1000).getHours()) : hh;
    for (let i = 0; i < 2; i++) {
      const rx = (i === 1 ? recoil : recoil * 0.4);
      const sway = 0.14 * Math.sin(t * 0.9 + i * 2) + (flash > 0 ? 0.25 * flash : 0);
      if (show && burn < 1) {
        const s = ST[i]; s.L = WY.PATHS[prevHH[i]].L; s.burn = burn; s.flash = 0; s.glint = -99;
        const hd = WY.lay({ ox: HOUR_X[i] + shx, oy: HOUR_Y + shy, digit: prevHH[i], head: 1, t, sway, own: i, pr: 0 });
        if (burn < 0.35) heads[i] = hd;
      }
      if (emerge > 0) {
        const s = ST[2 + i], L = WY.PATHS[curHH[i]].L;
        s.L = L; s.burn = 0; s.flash = i === 1 ? flash : flash * 0.3;
        s.glint = ((t * 24 + i * 70) % (L + 90)) - 25;
        const hd = WY.lay({ ox: HOUR_X[i] + rx + shx, oy: HOUR_Y + shy, digit: curHH[i], head: emerge, t, sway, own: 2 + i, pr: 1 });
        if (!show || u > 0.05) heads[i] = hd;
      }
    }
    WY.shadeAll(ST);
    // heads: eyes and a flicking tongue (not while burning)
    for (let i = 0; i < 2; i++) {
      const hd = heads[i]; if (!hd) continue;
      const nx = -hd.fy, ny = hd.fx;
      // two swept-back horns
      for (const sg of [-1, 1]) {
        const bx = hd.x + hd.fx * 0.6 + nx * 3.4 * sg, by = hd.y + hd.fy * 0.6 + ny * 3.4 * sg;
        G.S.grow = 0.9; G.S.ink = [0, 0, 0];
        G.capsule(bx, by, bx - hd.fx * 4.2 + nx * 2.4 * sg, by - hd.fy * 4.2 + ny * 2.4 * sg, 0.95, HORN, 0.35);
        G.S.grow = 0; G.S.ink = null;
        G.capsule(bx, by, bx - hd.fx * 4.2 + nx * 2.4 * sg, by - hd.fy * 4.2 + ny * 2.4 * sg, 0.95, HORN, 0.35);
      }
      for (const sg of [-1, 1]) {
        const ex = hd.x + hd.fx * 2.4 + nx * 2.5 * sg, ey = hd.y + hd.fy * 2.4 + ny * 2.5 * sg;
        G.disc(ex, ey, 1.3, EYE);
        G.capsule(ex + hd.fx * 0.2, ey - 0.6, ex + hd.fx * 0.2, ey + 0.6, 0.4, [0, 0, 0]);
      }
      const ph = (t / (3.7 + i * 0.9) + i * 0.37) % 1;
      if (ph < 0.09 || (flash > 0.2)) {
        const ext = flash > 0.2 ? 4.5 : 4.5 * Math.sin(Math.PI * ph / 0.09);
        const tx = hd.x + hd.fx * (6.5 + ext), ty = hd.y + hd.fy * (6.5 + ext);
        G.capsule(hd.x + hd.fx * 6.2, hd.y + hd.fy * 6.2, tx, ty, 0.5, TONGUE);
        G.capsule(tx, ty, tx + hd.fx * 1.6 + nx * 1.2, ty + hd.fy * 1.6 + ny * 1.2, 0.4, TONGUE);
        G.capsule(tx, ty, tx + hd.fx * 1.6 - nx * 1.2, ty + hd.fy * 1.6 - ny * 1.2, 0.4, TONGUE);
      }
      G.S.alpha = 1;
    }
    // new wyrms rise out of summoning portals at their tails
    if (show && u > -0.45 && u < 1.8) {
      const pa = bump(u, -0.45, -0.1, 0.8, 1.8);
      for (let i = 0; i < 2; i++) {
        const Pp = WY.PATHS[curHH[i]], x = HOUR_X[i] + Pp.x[0], y = HOUR_Y + Pp.y[0];
        G.glow(x, y, 9, PORTAL, 0.5 * pa);
        for (let k = 0; k < 6; k++) {
          const a = t * 5 + k * 1.047, r = 6.5 * (0.6 + 0.4 * Math.sin(t * 3 + k));
          G.glowLine(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, x + Math.cos(a + 0.7) * r * 0.5, y + Math.sin(a + 0.7) * r * 0.3, 1.1, PORTAL, 0.6 * pa);
        }
      }
    }

    // ------------------------------------------------------- the party
    const pose = [];
    for (let i = 0; i < 3; i++) {
      let x = HOME[i][0], y = HOME[i][1];
      P.b = 0.5 * Math.sin(t * 2.3 + i * 1.9); P.st = 0; P.fl = t * 2.6 + i * 1.3; P.blink = blinkAt(t, i); P.lean = 0;
      P.arm = i === 0 ? 0.42 + 0.05 * Math.sin(t * 2.3) : 0;
      if (!hourTurn && i === atk && u > -1.25 && u < 1.3) {
        if (i === 1) {
          // black mage: steps up, raises the staff, throws fire
          const fwd = 8 * (E.inOut(cl((u + 1.2) / 0.4)) - E.inOut(cl((u - 0.25) / 0.7)));
          x -= fwd; P.st = Math.sin((u + 1.2) * 18) * (u < -0.8 || (u > 0.25 && u < 0.95) ? 1 : 0);
          P.arm = 1.2 * bump(u, -0.85, -0.55, -0.35, 0.1);
          P.lean = -1 * bump(u, -0.5, -0.4, -0.1, 0.2);
        } else {
          const [tx, ty] = MELEE[i];
          if (u < -0.3) {
            const f = cl((u + 1.2) / 0.9), e = E.inOut(f);
            x += (tx - x) * e; y += (ty - y) * e;
            P.st = Math.sin((u + 1.2) * 26); P.b = -Math.abs(Math.sin((u + 1.2) * 26)) * 1.1; P.lean = -1.6;
          } else if (u < 0.12) {
            x = tx; y = ty;
            const f = (u + 0.3) / 0.42;
            y -= 5 * Math.sin(Math.PI * Math.min(1, f * 1.1));
            P.lean = -1.2;
            if (i === 0) P.arm = f < 0.45 ? 0.42 - 1.9 * E.out(f / 0.45) : -1.48 + 4.0 * E.out(cl((f - 0.45) / 0.35));
            else { P.arm = Math.max(0, Math.sin(f * Math.PI * 4)) * 1.6; P.st = Math.sin(f * 20) * 0.5; }
          } else {
            const f = cl((u - 0.12) / 0.95), e = E.inOut(f);
            x = tx + (HOME[i][0] - tx) * e; y = ty + (HOME[i][1] - ty) * e;
            y -= 9 * Math.sin(Math.PI * f);
            P.arm = i === 0 ? 2.52 + (0.42 - 2.52) * E.inOut(cl(f * 1.4)) : 0;
            P.st = f < 0.9 ? -0.6 : 0;
          }
        }
      }
      if (show) {
        // the party calls the summon, arms up; then cheers
        const call = bump(u, -5.0, -4.4, -2.0, -1.4);
        if (i === 0) P.arm = 0.42 - 0.9 * call; else P.arm = Math.max(P.arm, 1.2 * call);
        if (u > 0.3 && u < 2.8) { const j = Math.abs(Math.sin((u - 0.3) * 7 + i * 0.9)); y -= 3 * j * (1 - (u - 0.3) / 2.5); P.blink = 0.15; }
      }
      pose.push(x, y);
      HEROES[i](x + shx, y + shy, P);
    }

    // ------------------------------------------------------- strikes
    if (!hourTurn && u > -1.3 && u < 1) {
      if (atk === 0) FX.slash(HIT.x - 1, HIT.y - 6, 12, cl((u + 0.12) / 0.26), u < 0.1 ? 1 : cl(1 - (u - 0.1) / 0.3));
      if (atk === 2) for (const ti of [-0.24, -0.12, 0]) FX.impact(HIT.x + 6 + (ti * 30), HIT.y - 6 + ti * 20, u - ti);
      if (atk === 1) {
        const mx = pose[2] - 5.4, my = pose[3] - 21;
        if (u > -0.9 && u < -0.35) {
          const k = bump(u, -0.9, -0.6, -0.4, -0.35);
          G.glow(mx, my, 6 * k, FX.FX.fireO, 0.6 * k);
          for (let j = 0; j < 6; j++) { const a = j * 1.05 + u * 9, r = 8 * (1 - cl((u + 0.9) / 0.5)) + 2; G.glow(mx + Math.cos(a) * r, my + Math.sin(a) * r, 1.6, FX.FX.fireY, 0.5); }
        }
        if (u >= -0.35 && u < 0) {
          const f = (u + 0.35) / 0.35, e = E.in(f) * 0.6 + f * 0.4;
          const x = mx + (HIT.x - mx) * e, y = my + (HIT.y - my) * e - 14 * Math.sin(Math.PI * e);
          for (let j = 1; j < 6; j++) { const g = Math.max(0, e - j * 0.04); FX.fireball(mx + (HIT.x - mx) * g, my + (HIT.y - my) * g - 14 * Math.sin(Math.PI * g), t, 0.28 * (1 - j / 6)); }
          FX.fireball(x, y, t, 1);
        }
      }
      FX.burst(HIT.x, HIT.y - 4, u, bi, atk === 1 ? 1.25 : 0.9);
    }

    // ------------------------------------------------------ the summon
    if (show) {
      const px = PH.x, py = PH.y;
      // charge: sparks gather to the bird
      if (u > -2.2 && u < -1.25) {
        const k = bump(u, -2.2, -1.8, -1.4, -1.25);
        for (let j = 0; j < 10; j++) { const a = j * 0.628 + u * 2, r = 30 * (1 - ((u * 1.3 + j * 0.1) % 1 + 1) % 1); G.glow(px + Math.cos(a) * r, py + Math.sin(a) * r, 1.8, FX.FX.fireY, 0.6 * k); }
      }
      // firestorm over the wyrms, and embers rising from them
      if (u > -1.05 && u < 1.6) {
        for (let j = 0; j < 90; j++) {
          const Pp = WY.PATHS[prevHH[j & 1]], kk = Math.floor(kit.hash(j, 5) * Pp.n);
          const age = u + 1.0 - kit.hash(j, 6) * 0.8;
          if (age < 0 || age > 1.6) continue;
          const x = HOUR_X[j & 1] + Pp.x[kk] + 6 * Math.sin(age * 3 + j), y = HOUR_Y + Pp.y[kk] - 26 * age - 6 * age * age;
          G.glow(x, y, 1.6, j % 3 ? FX.FX.fireO : FX.FX.fireY, 0.8 * (1 - age / 1.6));
        }
      }
    }

    // ------------------------------------------------ the damage number
    for (let i = 0; i < 2; i++) {
      const bob = 0.7 * Math.sin(t * 1.7 + i * 1.1);
      if (u >= 0 && u < 2.2) {
        const fx = hourTurn ? 48 : HIT.x, fy = hourTurn ? 40 : HIT.y - 4;
        const v = u - (hourTurn ? 0.05 : 0) - i * 0.08;
        if (v < 0) continue;
        popDigit(i, v, fx, fy);
        const blend = cl((u - 1.6) / 0.6);
        damageDigit(mm[i], DD.x, DD.y + bob * blend, DD.s, DD.sy, DD.a, DD.f);
      } else if (u < 0 && u > -0.4) {
        const f = (u + 0.4) / 0.4;      // the old number fades, lifting
        damageDigit(mm[i], REST_X + i * ADV - 2 * f, REST_Y + bob - 4 * f, SC * (1 + 0.1 * f), 1, (1 - f) ** 1.5, 0.4 * f);
      } else {
        damageDigit(mm[i], REST_X + i * ADV, REST_Y + bob, SC, 1, 1, 0);
      }
    }

    // ------------------------------------------------------- the window
    FX.windowBox(0, WIN_Y, 42, H - WIN_Y);
    FX.windowBox(42, WIN_Y, 86, H - WIN_Y);
    // left: enemies, or the action's name while it plays
    let act = -1, actA = 0;
    if (show) { act = 3; actA = bump(u, -5, -4.6, 1.6, 2.2); }
    else if (!hourTurn && u > -1.3 && u < 1.4) { act = atk; actA = bump(u, -1.3, -1.1, 1.0, 1.4); }
    const listA = cl(1 - 2 * actA); actA = cl(2 * actA - 1);
    if (listA > 0) { menuText('WYRM', 6, ROW[0], TXT, listA); menuText('WYRM', 6, ROW[1], TXT, listA); }
    if (actA > 0) {
      const s = act === 3 ? 'PHOENIX' : ACTS[act];
      menuText(s, Math.round(21 - menuWidth(s) / 2), ROW[1] - 3, GOLD, actA);
    }
    // right: the party, ATB gauges, the cursor on whoever acts next
    const A = Math.floor((now + 1.2) / 60), since = (now + 1.2) - A * 60;
    for (let i = 0; i < 3; i++) {
      const fill = (((((now + 1.2) / 60 - i) % 3) + 3) % 3) / 3;
      const ready = fill > 2.9 / 3;
      menuText(NAMES[i], 52, ROW[i], ready ? GOLD : TXT, 1);
      const bx = 84, bw = 39, by = ROW[i] + 1;
      for (let y = by; y < by + 3; y++) for (let x = bx; x < bx + bw; x++) {
        const o = 3 * (y * W + x), ff = cl(fill * bw - (x - bx));
        const c = ready ? ATBF : ATB, k = (y === by ? 1 : 0.7) * (ready ? 0.75 + 0.25 * Math.sin(t * 12) : 1);
        img[o] = ATBE[0] + (c[0] * k - ATBE[0]) * ff; img[o + 1] = ATBE[1] + (c[1] * k - ATBE[1]) * ff; img[o + 2] = ATBE[2] + (c[2] * k - ATBE[2]) * ff;
      }
    }
    const r0 = ((A % 3) + 3) % 3, r1 = (r0 + 1) % 3;
    const cy = ROW[r0] + 2 + (ROW[r1] - ROW[r0]) * E.inOut(cl((since - 2.7) / 0.45));
    const cx = 45 + (since < 0.3 ? 1.6 * Math.sin(since / 0.3 * Math.PI) : 0) + 0.6 * Math.sin(t * 4);
    const ca = 0.7 + 0.3 * Math.sin(t * 6);
    G.S.alpha = ca;
    G.poly([cx, cy - 2.4, cx + 4, cy, cx, cy + 2.4], TXT);
    G.S.alpha = 1;

    // the summon's white flash
    if (show && u > -1.0 && u < -0.4) {
      const f = 0.7 * Math.exp(-(u + 1.0) * 11);
      for (let p = 0; p < img.length; p++) img[p] += (1 - img[p]) * f;
    }

    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
