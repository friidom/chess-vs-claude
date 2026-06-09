'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────
const isW  = p => p && p === p.toUpperCase();
const colr = p => isW(p) ? 'white' : 'black';
const opp  = c => c === 'white' ? 'black' : 'white';
const inB  = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// ─── Pseudo-legal Move Generation ────────────────────────────────────────
function pseudo(b, r, c, ep, cr) {
  const p = b[r][c];
  if (!p) return [];
  const moves = [], w = isW(p), t = p.toLowerCase();

  const push = (tr, tc, sp) => {
    if (!inB(tr, tc)) return false;
    const tgt = b[tr][tc];
    if (tgt && colr(tgt) === colr(p)) return false;
    moves.push({ from: [r, c], to: [tr, tc], sp: sp || null });
    return !tgt; // returns true if square was empty (can keep sliding)
  };

  const slide = dirs => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) { if (!push(rr, cc)) break; rr += dr; cc += dc; }
    }
  };

  if (t === 'p') {
    const dir = w ? -1 : 1, sr = w ? 6 : 1, pr = w ? 0 : 7;
    if (inB(r + dir, c) && !b[r + dir][c]) {
      moves.push({ from: [r, c], to: [r + dir, c], sp: r + dir === pr ? 'promo' : null });
      if (r === sr && !b[r + 2 * dir][c])
        moves.push({ from: [r, c], to: [r + 2 * dir, c], sp: 'dp' });
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!inB(nr, nc)) continue;
      if (b[nr][nc] && colr(b[nr][nc]) !== colr(p))
        moves.push({ from: [r, c], to: [nr, nc], sp: nr === pr ? 'promo' : null });
      if (ep && nr === ep[0] && nc === ep[1])
        moves.push({ from: [r, c], to: [nr, nc], sp: 'ep' });
    }
  } else if (t === 'n') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
      push(r + dr, c + dc);
  } else if (t === 'b') {
    slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
  } else if (t === 'r') {
    slide([[-1,0],[1,0],[0,-1],[0,1]]);
  } else if (t === 'q') {
    slide([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
  } else if (t === 'k') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
      push(r + dr, c + dc);
    const enemy = opp(colr(p));
    const safe  = sq => !attacked(b, sq[0], sq[1], enemy);
    if (w) {
      if (cr.wK && !b[7][5] && !b[7][6] && safe([7,4]) && safe([7,5]) && safe([7,6]))
        moves.push({ from: [r,c], to: [7,6], sp: 'cks' });
      if (cr.wQ && !b[7][3] && !b[7][2] && !b[7][1] && safe([7,4]) && safe([7,3]) && safe([7,2]))
        moves.push({ from: [r,c], to: [7,2], sp: 'cqs' });
    } else {
      if (cr.bK && !b[0][5] && !b[0][6] && safe([0,4]) && safe([0,5]) && safe([0,6]))
        moves.push({ from: [r,c], to: [0,6], sp: 'cks' });
      if (cr.bQ && !b[0][3] && !b[0][2] && !b[0][1] && safe([0,4]) && safe([0,3]) && safe([0,2]))
        moves.push({ from: [r,c], to: [0,2], sp: 'cqs' });
    }
  }
  return moves;
}

// ─── Attack Detection ─────────────────────────────────────────────────────
function attacked(b, r, c, byColor) {
  for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
    const p = b[rr][cc];
    if (!p || colr(p) !== byColor) continue;
    const t = p.toLowerCase(), w = isW(p);
    if (t === 'p') {
      const d = w ? -1 : 1;
      if (rr + d === r && (cc - 1 === c || cc + 1 === c)) return true;
    } else if (t === 'n') {
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        if (rr + dr === r && cc + dc === c) return true;
    } else if (t === 'k') {
      if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) return true;
    }
    if (t === 'b' || t === 'q') {
      for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let x = rr+dr, y = cc+dc;
        while (inB(x, y)) { if (x===r && y===c) return true; if (b[x][y]) break; x+=dr; y+=dc; }
      }
    }
    if (t === 'r' || t === 'q') {
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let x = rr+dr, y = cc+dc;
        while (inB(x, y)) { if (x===r && y===c) return true; if (b[x][y]) break; x+=dr; y+=dc; }
      }
    }
  }
  return false;
}

// ─── Board Utilities ──────────────────────────────────────────────────────
function findKing(b, color) {
  const k = color === 'white' ? 'K' : 'k';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (b[r][c] === k) return [r, c];
  return null;
}

function inCheck(b, color) {
  const k = findKing(b, color);
  return k ? attacked(b, k[0], k[1], opp(color)) : false;
}

function applyMove(b, mv, promo) {
  const nb = b.map(r => [...r]);
  const [fr, fc] = mv.from, [tr, tc] = mv.to, p = nb[fr][fc];
  nb[tr][tc] = p;
  nb[fr][fc] = null;
  if (mv.sp === 'ep')   { nb[isW(p) ? tr+1 : tr-1][tc] = null; }
  if (mv.sp === 'cks')  { isW(p) ? (nb[7][5]='R', nb[7][7]=null) : (nb[0][5]='r', nb[0][7]=null); }
  if (mv.sp === 'cqs')  { isW(p) ? (nb[7][3]='R', nb[7][0]=null) : (nb[0][3]='r', nb[0][0]=null); }
  if (mv.sp === 'promo') {
    const pt = promo || 'q';
    nb[tr][tc] = isW(p) ? pt.toUpperCase() : pt.toLowerCase();
  }
  return nb;
}

function legalMoves(b, color, ep, cr) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p || colr(p) !== color) continue;
    for (const mv of pseudo(b, r, c, ep, cr))
      if (!inCheck(applyMove(b, mv, 'q'), color)) out.push(mv);
  }
  return out;
}

function updateCastlingRights(cr, p, from) {
  const n = { ...cr };
  if (p === 'K') { n.wK = false; n.wQ = false; }
  if (p === 'k') { n.bK = false; n.bQ = false; }
  if (p === 'R' && from[0] === 7 && from[1] === 7) n.wK = false;
  if (p === 'R' && from[0] === 7 && from[1] === 0) n.wQ = false;
  if (p === 'r' && from[0] === 0 && from[1] === 7) n.bK = false;
  if (p === 'r' && from[0] === 0 && from[1] === 0) n.bQ = false;
  return n;
}

// ─── Algebraic Notation ───────────────────────────────────────────────────
function toAlgebraic(b, mv, allLegal, promo) {
  const [fr, fc] = mv.from, [tr, tc] = mv.to, p = b[fr][fc];
  if (!p) return '?';
  if (mv.sp === 'cks') return 'O-O';
  if (mv.sp === 'cqs') return 'O-O-O';
  const t = p.toLowerCase(), sq = FILES[tc] + RANKS[tr];
  const cap = !!(b[tr][tc]) || mv.sp === 'ep';
  if (t === 'p') {
    let n = cap ? FILES[fc] + 'x' + sq : sq;
    if (mv.sp === 'promo') n += '=' + (promo || 'q').toUpperCase();
    return n;
  }
  const amb = allLegal.filter(m => {
    if (m.from[0] === fr && m.from[1] === fc) return false;
    const q = b[m.from[0]][m.from[1]];
    return q && q.toLowerCase() === t && m.to[0] === tr && m.to[1] === tc;
  });
  let dis = '';
  if (amb.length > 0) {
    if (!amb.some(m => m.from[1] === fc))      dis = FILES[fc];
    else if (!amb.some(m => m.from[0] === fr)) dis = RANKS[fr];
    else                                        dis = FILES[fc] + RANKS[fr];
  }
  return t.toUpperCase() + dis + (cap ? 'x' : '') + sq;
}
