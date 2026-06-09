'use strict';

// ─── Transposition Table ──────────────────────────────────────────────────
const TT_SIZE = 1 << 18; // 262 144 entries
const TT_MASK = TT_SIZE - 1;
const TT = new Array(TT_SIZE).fill(null);
// flag:  0 = EXACT   1 = LOWER-BOUND (beta cut)   2 = UPPER-BOUND (all-node)

function zHash(b, color, ep, cr) {
  let h = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p) h ^= ZK.p[p][r * 8 + c];
    }
  if (color === 'black') h ^= ZK.turn;
  if (cr.wK) h ^= ZK.wK;  if (cr.wQ) h ^= ZK.wQ;
  if (cr.bK) h ^= ZK.bK;  if (cr.bQ) h ^= ZK.bQ;
  if (ep) h ^= ZK.ep[ep[1]];
  return h >>> 0;
}

// ─── Evaluation ───────────────────────────────────────────────────────────
function evalAbsolute(b) {
  let score = 0, wMat = 0, bMat = 0;

  // Count non-pawn, non-king material for endgame detection
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]; if (!p) continue;
    const t = p.toLowerCase();
    if (t !== 'k' && t !== 'p') { if (isW(p)) wMat += VAL[t]; else bMat += VAL[t]; }
  }
  const endgame = wMat + bMat < 1400;

  // Material + Piece-square tables
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]; if (!p) continue;
    const t = p.toLowerCase(), w = isW(p), pr = w ? r : 7 - r;
    const tbl = t === 'k' ? (endgame ? KE : PT.k) : PT[t];
    score += (w ? 1 : -1) * (VAL[t] + (tbl ? tbl[pr][c] : 0));
  }

  // Pawn structure: doubled + isolated
  for (let c = 0; c < 8; c++) {
    let wp = 0, bp = 0;
    for (let r = 0; r < 8; r++) { if (b[r][c] === 'P') wp++; if (b[r][c] === 'p') bp++; }
    if (wp > 1) score -= 20 * (wp - 1);
    if (bp > 1) score += 20 * (bp - 1);
    const lw = c > 0 && b.some(r => r[c-1] === 'P'), rw = c < 7 && b.some(r => r[c+1] === 'P');
    const lb = c > 0 && b.some(r => r[c-1] === 'p'), rb = c < 7 && b.some(r => r[c+1] === 'p');
    if (wp > 0 && !lw && !rw) score -= 15; // isolated white pawn
    if (bp > 0 && !lb && !rb) score += 15; // isolated black pawn
  }

  // Passed pawns
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (b[r][c] === 'P') {
      let ok = true;
      for (let rr = r - 1; rr >= 0 && ok; rr--)
        for (let cc = Math.max(0, c-1); cc <= Math.min(7, c+1) && ok; cc++)
          if (b[rr][cc] === 'p') ok = false;
      if (ok) score += [0,0,5,10,20,40,70,0][r];
    } else if (b[r][c] === 'p') {
      let ok = true;
      for (let rr = r + 1; rr < 8 && ok; rr++)
        for (let cc = Math.max(0, c-1); cc <= Math.min(7, c+1) && ok; cc++)
          if (b[rr][cc] === 'P') ok = false;
      if (ok) score -= [0,70,40,20,10,5,0,0][r];
    }
  }

  // Bishop pair bonus
  const bFlat = b.flat();
  if (bFlat.filter(p => p === 'B').length >= 2) score += 30;
  if (bFlat.filter(p => p === 'b').length >= 2) score -= 30;

  // Rooks on open / semi-open files
  for (let c = 0; c < 8; c++) {
    let wP = false, bP = false;
    for (let r = 0; r < 8; r++) { if (b[r][c] === 'P') wP = true; if (b[r][c] === 'p') bP = true; }
    for (let r = 0; r < 8; r++) {
      if (b[r][c] === 'R') score += !wP && !bP ? 25 : !wP ? 10 : 0;
      if (b[r][c] === 'r') score -= !wP && !bP ? 25 : !bP ? 10 : 0;
    }
  }

  // King safety (middlegame only)
  if (!endgame) {
    const wk = findKing(b, 'white'), bk = findKing(b, 'black');
    if (wk) {
      const [kr, kc] = wk;
      for (let dc = -1; dc <= 1; dc++) {
        const nc = kc + dc;
        if (nc >= 0 && nc < 8)
          score += (b[kr-1] && b[kr-1][nc] === 'P') ? 12 : -18;
      }
    }
    if (bk) {
      const [kr, kc] = bk;
      for (let dc = -1; dc <= 1; dc++) {
        const nc = kc + dc;
        if (nc >= 0 && nc < 8)
          score -= (b[kr+1] && b[kr+1][nc] === 'p') ? 12 : -18;
      }
    }
  }

  return score;
}

const evalRelative = (b, color) => {
  const s = evalAbsolute(b);
  return color === 'white' ? s : -s;
};

// ─── Move Ordering ────────────────────────────────────────────────────────
function sortMoves(b, moves, ttMove) {
  const score = mv => {
    if (ttMove &&
        mv.from[0] === ttMove.from[0] && mv.from[1] === ttMove.from[1] &&
        mv.to[0]   === ttMove.to[0]   && mv.to[1]   === ttMove.to[1]) return 30000;
    const cap = b[mv.to[0]][mv.to[1]];
    if (cap) {
      const cv = VAL[cap.toLowerCase()] || 0;
      const av = VAL[b[mv.from[0]][mv.from[1]].toLowerCase()] || 0;
      return 20000 + cv * 10 - av;
    }
    if (mv.sp === 'promo') return 19000;
    return 0;
  };
  moves.sort((a, b2) => score(b2) - score(a));
}

// ─── Quiescence Search ────────────────────────────────────────────────────
function quiesce(b, alpha, beta, color, ep, cr) {
  const stand = evalRelative(b, color);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;

  const caps = legalMoves(b, color, ep, cr)
    .filter(m => b[m.to[0]][m.to[1]] || m.sp === 'ep' || m.sp === 'promo');
  sortMoves(b, caps, null);

  for (const mv of caps) {
    const cap = b[mv.to[0]][mv.to[1]];
    // Delta pruning: skip if capture can't improve alpha even with margin
    if (cap && stand + (VAL[cap.toLowerCase()] || 0) + 200 < alpha) continue;
    const nb  = applyMove(b, mv, 'q');
    const nep = mv.sp === 'dp' ? [(mv.from[0]+mv.to[0])/2, mv.to[1]] : null;
    const ncr = updateCastlingRights(cr, b[mv.from[0]][mv.from[1]], mv.from);
    const s = -quiesce(nb, -beta, -alpha, opp(color), nep, ncr);
    if (s >= beta) return s;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

// ─── Negamax + TT + Null-Move + LMR ──────────────────────────────────────
function hasMajorPieces(b, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p || colr(p) !== color) continue;
    const t = p.toLowerCase();
    if (t === 'n' || t === 'b' || t === 'r' || t === 'q') return true;
  }
  return false;
}

function negamax(b, depth, alpha, beta, color, ep, cr) {
  const h = zHash(b, color, ep, cr);

  // Transposition table probe
  let ttMove = null;
  const tte = TT[h & TT_MASK];
  if (tte && tte.h === h) {
    ttMove = tte.move;
    if (tte.depth >= depth) {
      if (tte.flag === 0) return tte.score;
      if (tte.flag === 1) alpha = Math.max(alpha, tte.score);
      else               beta  = Math.min(beta,  tte.score);
      if (alpha >= beta) return tte.score;
    }
  }

  const moves = legalMoves(b, color, ep, cr);
  if (!moves.length) return inCheck(b, color) ? -25000 + depth : 0;
  if (depth <= 0)    return quiesce(b, alpha, beta, color, ep, cr);

  // Null-move pruning (skip in endgame / when in check to avoid zugzwang)
  if (depth >= 3 && !inCheck(b, color) && hasMajorPieces(b, color)) {
    const R = depth >= 5 ? 3 : 2;
    const ns = -negamax(b, depth - 1 - R, -beta, -(beta - 1), opp(color), null, cr);
    if (ns >= beta) return beta;
  }

  sortMoves(b, moves, ttMove);

  let best = -Infinity, bestMove = null, origAlpha = alpha;

  for (let i = 0; i < moves.length; i++) {
    const mv  = moves[i];
    const nb  = applyMove(b, mv, 'q');
    const nep = mv.sp === 'dp' ? [(mv.from[0]+mv.to[0])/2, mv.to[1]] : null;
    const ncr = updateCastlingRights(cr, b[mv.from[0]][mv.from[1]], mv.from);

    // Late Move Reduction for quiet moves deep in list
    let d = depth - 1;
    if (i >= 4 && depth >= 3 && !b[mv.to[0]][mv.to[1]] && !mv.sp && !inCheck(b, color))
      d = Math.max(0, depth - 2);

    let s = -negamax(nb, d, -beta, -alpha, opp(color), nep, ncr);
    // Re-search at full depth if LMR raised alpha
    if (s > alpha && d < depth - 1)
      s = -negamax(nb, depth - 1, -beta, -alpha, opp(color), nep, ncr);

    if (s > best)  { best = s; bestMove = mv; }
    if (s > alpha)   alpha = s;
    if (alpha >= beta) break;
  }

  // Store in transposition table
  const flag = best <= origAlpha ? 2 : best >= beta ? 1 : 0;
  const old  = TT[h & TT_MASK];
  if (!old || old.depth <= depth)
    TT[h & TT_MASK] = { h, depth, score: best, flag, move: bestMove };

  return best;
}

// ─── Root: Iterative Deepening ────────────────────────────────────────────
function bestAIMove(b, ep, cr, maxDepth) {
  let bestMv = null;
  for (let d = 1; d <= maxDepth; d++) {
    const moves = legalMoves(b, 'black', ep, cr);
    if (!moves.length) return null;
    sortMoves(b, moves, bestMv); // seed ordering from previous iteration
    let best = -Infinity, cur = moves[0], alpha = -Infinity;
    for (const mv of moves) {
      const nb  = applyMove(b, mv, 'q');
      const nep = mv.sp === 'dp' ? [(mv.from[0]+mv.to[0])/2, mv.to[1]] : null;
      const ncr = updateCastlingRights(cr, b[mv.from[0]][mv.from[1]], mv.from);
      const s   = -negamax(nb, d - 1, -Infinity, -alpha, 'white', nep, ncr);
      if (s > best) { best = s; cur = mv; }
      if (s > alpha) alpha = s;
    }
    bestMv = cur;
  }
  return bestMv;
}
