'use strict';

// ─── Game State ───────────────────────────────────────────────────────────
let board, turn, sel, validMoves, gameOver, isThinking;
let castling, ep, history, capW, capB, lastMove;
let flipped   = false;
let stateStack = []; // full snapshots for undo

// ─── State Snapshot ───────────────────────────────────────────────────────
function snapshot() {
  return {
    board    : board.map(r => [...r]),
    castling : { ...castling },
    ep,
    capW     : [...capW],
    capB     : [...capB],
    turn,
    lastMove : lastMove ? { ...lastMove, from: [...lastMove.from], to: [...lastMove.to] } : null,
    history  : history.map(h => ({ ...h }))
  };
}

function restoreSnapshot(s) {
  board    = s.board.map(r => [...r]);
  castling = { ...s.castling };
  ep       = s.ep;
  capW     = [...s.capW];
  capB     = [...s.capB];
  turn     = s.turn;
  lastMove = s.lastMove;
  history  = s.history.map(h => ({ ...h }));
}

// ─── New Game ─────────────────────────────────────────────────────────────
function newGame() {
  board = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    Array(8).fill(null), Array(8).fill(null),
    Array(8).fill(null), Array(8).fill(null),
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
  turn       = 'white';
  sel        = null;
  validMoves = [];
  gameOver   = false;
  isThinking = false;
  castling   = { wK: true, wQ: true, bK: true, bQ: true };
  ep         = null;
  history    = [];
  capW       = [];
  capB       = [];
  lastMove   = null;
  stateStack = [snapshot()]; // push initial state

  TT.fill(null); // clear transposition table

  document.getElementById('moves-list').innerHTML = '';
  document.getElementById('move-count').textContent = '0';
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('btn-undo').disabled = true;

  setStatus('Your turn', '♟', '');
  render();
}

// ─── Board Rendering ──────────────────────────────────────────────────────
function render() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const ckKing  = inCheck(board, turn) ? findKing(board, turn) : null;
  const selMvs  = sel ? validMoves.filter(m => m.from[0] === sel[0] && m.from[1] === sel[1]) : [];
  const vset    = new Set(selMvs.map(m => m.to[0] * 8 + m.to[1]));

  for (let vi = 0; vi < 8; vi++) {
    for (let vj = 0; vj < 8; vj++) {
      const r = flipped ? 7 - vi : vi;
      const c = flipped ? 7 - vj : vj;
      const isLight = (r + c) % 2 === 0;

      const sq = document.createElement('div');
      let cls = isLight ? 'lt' : 'dk';
      if (sel && sel[0] === r && sel[1] === c)
        cls = isLight ? 'slt' : 'sdk';
      else if (lastMove &&
        ((lastMove.from[0]===r && lastMove.from[1]===c) ||
         (lastMove.to[0]===r   && lastMove.to[1]===c)))
        cls = isLight ? 'mlt' : 'mdk';

      sq.className = 'sq ' + cls;
      if (ckKing && ckKing[0] === r && ckKing[1] === c) sq.classList.add('ck');
      if (vset.has(r * 8 + c))
        sq.classList.add(board[r][c] || (ep && r===ep[0] && c===ep[1]) ? 'vc' : 'vm');

      // Coordinate labels (rank on left col, file on bottom row)
      if (vj === 0) {
        const span = document.createElement('span');
        span.className = 'coord coord-r';
        span.textContent = flipped ? vi + 1 : 8 - vi;
        sq.appendChild(span);
      }
      if (vi === 7) {
        const span = document.createElement('span');
        span.className = 'coord coord-f';
        span.textContent = FILES[c];
        sq.appendChild(span);
      }

      // Piece
      if (board[r][c]) {
        const pd = document.createElement('span');
        pd.className = 'pc ' + (isW(board[r][c]) ? 'pw' : 'pb');
        pd.textContent = SYM[board[r][c]];
        sq.appendChild(pd);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }

  updatePlayerCards();
}

// ─── Player Cards ─────────────────────────────────────────────────────────
function updatePlayerCards() {
  const topCard = document.getElementById('player-top');
  const botCard = document.getElementById('player-bottom');

  // Assign who is on top/bottom based on flip state
  const topIsBlack = !flipped;
  const topName    = topIsBlack ? 'Claude'  : 'You';
  const botName    = topIsBlack ? 'You'     : 'Claude';
  const topTitle   = topIsBlack ? 'AI · Black' : 'White';
  const botTitle   = topIsBlack ? 'White'      : 'AI · Black';
  const topAvatar  = topIsBlack ? '🤖' : '🧑';
  const botAvatar  = topIsBlack ? '🧑' : '🤖';

  topCard.querySelector('.player-name').textContent   = topName;
  topCard.querySelector('.player-title').textContent  = topTitle;
  topCard.querySelector('.player-avatar').textContent = topAvatar;
  botCard.querySelector('.player-name').textContent   = botName;
  botCard.querySelector('.player-title').textContent  = botTitle;
  botCard.querySelector('.player-avatar').textContent = botAvatar;

  // capW = pieces white captured (black pieces)
  // capB = pieces black captured (white pieces)
  const topCap  = topIsBlack ? capB : capW; // Claude captured white; You captured black
  const botCap  = topIsBlack ? capW : capB;
  const topOpp  = topIsBlack ? capW : capB;
  const botOpp  = topIsBlack ? capB : capW;

  renderMaterial(document.getElementById('mat-top'),    topCap, topOpp);
  renderMaterial(document.getElementById('mat-bottom'), botCap, botOpp);

  // Active player border
  const topActive  = (topIsBlack ? turn === 'black' : turn === 'white') && !gameOver;
  const botActive  = (topIsBlack ? turn === 'white' : turn === 'black') && !gameOver;
  topCard.classList.toggle('active', topActive || (isThinking && topIsBlack));
  botCard.classList.toggle('active', botActive);
}

function renderMaterial(el, myCap, theirCap) {
  const order  = ['q','r','b','n','p'];
  const counts = {};
  myCap.forEach(p => { const t = p.toLowerCase(); counts[t] = (counts[t] || 0) + 1; });

  const html = order.map(t => {
    const n = counts[t]; if (!n) return '';
    const sample = myCap.find(p => p.toLowerCase() === t);
    const cls    = isW(sample) ? 'pw' : 'pb';
    return `<span class="pc ${cls}" style="font-size:17px">${SYM[sample]}</span>`.repeat(n);
  }).join('');

  const myScore   = myCap.reduce((a, p)   => a + (VAL[p.toLowerCase()] || 0), 0);
  const theirScore= theirCap.reduce((a,p) => a + (VAL[p.toLowerCase()] || 0), 0);
  const adv = Math.round((myScore - theirScore) / 100);

  el.innerHTML = html + (adv > 0 ? `<span class="mat-adv">+${adv}</span>` : '');
}

// ─── Status Bar ───────────────────────────────────────────────────────────
function setStatus(text, icon, cls) {
  const card = document.getElementById('status-card');
  const sIcon = document.getElementById('status-icon');
  const sTxt  = document.getElementById('status-text');
  card.className = 'status-card ' + (cls || '');
  if (cls === 'thinking') {
    sIcon.innerHTML = '<div class="spinner"></div>';
    sTxt.textContent = 'Claude is thinking…';
  } else {
    sIcon.textContent = icon || '♟';
    sTxt.textContent  = text;
  }
}

// ─── Move History ─────────────────────────────────────────────────────────
function addMoveToHistory(notation, color) {
  const list = document.getElementById('moves-list');
  const num  = Math.ceil(history.length / 2);

  if (color === 'white') {
    const row = document.createElement('div');
    row.className = 'move-row';
    row.id = 'mr-' + num;
    row.innerHTML = `<span class="mn">${num}</span><span class="mh mw">${notation}</span><span class="mh mb"></span>`;
    list.appendChild(row);
  } else {
    const row = document.getElementById('mr-' + num);
    if (row) row.querySelector('.mb').textContent = notation;
  }

  document.getElementById('move-count').textContent = history.length;
  document.getElementById('moves-scroll').scrollTop = 99999;
}

function rebuildMoveList() {
  const list = document.getElementById('moves-list');
  list.innerHTML = '';
  let num = 0;
  for (let i = 0; i < history.length; i++) {
    const { notation, color } = history[i];
    if (color === 'white') {
      num = Math.ceil((i + 1) / 2);
      const row = document.createElement('div');
      row.className = 'move-row';
      row.id = 'mr-' + num;
      row.innerHTML = `<span class="mn">${num}</span><span class="mh mw">${notation}</span><span class="mh mb"></span>`;
      list.appendChild(row);
    } else {
      const row = document.getElementById('mr-' + num);
      if (row) row.querySelector('.mb').textContent = notation;
    }
  }
  document.getElementById('move-count').textContent = history.length;
}

// ─── Square Click Handler ─────────────────────────────────────────────────
function onSquareClick(r, c) {
  if (gameOver || isThinking || turn !== 'white') return;

  // If a valid destination is clicked
  if (sel && validMoves.some(m => m.from[0]===sel[0] && m.from[1]===sel[1] && m.to[0]===r && m.to[1]===c)) {
    const mv = validMoves.find(m => m.from[0]===sel[0] && m.from[1]===sel[1] && m.to[0]===r && m.to[1]===c);
    if (mv.sp === 'promo') showPromoDialog(pt => execMove(mv, pt));
    else                   execMove(mv, null);
    return;
  }

  // Select own piece
  const p = board[r][c];
  if (p && colr(p) === 'white') {
    sel        = [r, c];
    validMoves = legalMoves(board, 'white', ep, castling);
  } else {
    sel        = null;
    validMoves = [];
  }
  render();
}

// ─── Execute Move ─────────────────────────────────────────────────────────
function execMove(mv, promo) {
  const [fr, fc] = mv.from, [tr, tc] = mv.to, p = board[fr][fc];
  const allLegal = legalMoves(board, turn, ep, castling);

  // Save state before this move
  stateStack.push(snapshot());

  // Track captures
  if (board[tr][tc])  (turn === 'white' ? capW : capB).push(board[tr][tc]);
  if (mv.sp === 'ep') (turn === 'white' ? capW : capB).push(board[isW(p) ? tr+1 : tr-1][tc]);

  const preBoard = board.map(r => [...r]);
  board = applyMove(board, mv, promo);

  // Update castling rights for destination captures
  castling = updateCastlingRights(castling, p, [fr, fc]);
  if (tr===7&&tc===7) castling.wK=false; if (tr===7&&tc===0) castling.wQ=false;
  if (tr===0&&tc===7) castling.bK=false; if (tr===0&&tc===0) castling.bQ=false;

  ep = mv.sp === 'dp' ? [(fr+tr)/2, tc] : null;

  const movedBy = turn;
  turn       = opp(turn);
  sel        = null;
  validMoves = [];

  // Detect game result
  const nextMvs = legalMoves(board, turn, ep, castling);
  const check   = inCheck(board, turn);
  const suffix  = check ? (nextMvs.length === 0 ? '#' : '+') : '';
  const notation= toAlgebraic(preBoard, mv, allLegal, promo) + suffix;

  lastMove = mv;
  history.push({ mv, notation, color: movedBy });
  addMoveToHistory(notation, movedBy);
  document.getElementById('btn-undo').disabled = false;
  render();

  if (nextMvs.length === 0) {
    endGame(check
      ? (movedBy === 'white' ? 'You win!' : 'Claude wins!')
      : 'Draw!',
      check ? (movedBy === 'white' ? 'Checkmate — well played!' : 'Checkmate — Claude wins!')
            : 'Stalemate — the game is drawn.',
      check ? (movedBy === 'white' ? '🏆' : '🤖') : '🤝'
    );
    return;
  }

  if (turn === 'black') {
    setStatus('', '', 'thinking');
    isThinking = true;
    setTimeout(doAIMove, 60);
  } else {
    setStatus(check ? 'Check! Your turn' : 'Your turn', check ? '⚠️' : '♟', check ? 'check' : '');
  }
}

// ─── AI Move ──────────────────────────────────────────────────────────────
function doAIMove() {
  const depth = parseInt(document.getElementById('difficulty').value, 10);
  const mv    = bestAIMove(board, ep, castling, depth);
  isThinking  = false;
  if (mv) execMove(mv, mv.sp === 'promo' ? 'q' : null);
}

// ─── Undo Move ────────────────────────────────────────────────────────────
function undoMove() {
  if (isThinking || gameOver || stateStack.length <= 1) return;

  // Pop until we're back at white's turn (undo player + AI response)
  const pops = (stateStack.length >= 3 && turn === 'white') ? 2 : 1;
  for (let i = 0; i < pops; i++) {
    if (stateStack.length > 1) stateStack.pop();
  }

  restoreSnapshot(stateStack[stateStack.length - 1]);
  gameOver   = false;
  sel        = null;
  validMoves = [];

  rebuildMoveList();
  document.getElementById('btn-undo').disabled = stateStack.length <= 1;
  document.getElementById('gameover-overlay').classList.add('hidden');
  setStatus('Your turn', '♟', '');
  render();
}

// ─── Flip Board ───────────────────────────────────────────────────────────
function flipBoard() {
  flipped = !flipped;
  render();
}

// ─── Resign ───────────────────────────────────────────────────────────────
function resign() {
  if (gameOver || !history.length) return;
  endGame('Claude wins!', 'You resigned. Better luck next time!', '🤖');
}

// ─── End Game Modal ───────────────────────────────────────────────────────
function endGame(title, subtitle, icon) {
  gameOver = true;
  document.getElementById('gameover-icon').textContent     = icon;
  document.getElementById('gameover-title').textContent    = title;
  document.getElementById('gameover-subtitle').textContent = subtitle;
  document.getElementById('gameover-overlay').classList.remove('hidden');
  setStatus(title, icon, 'gameover');
  updatePlayerCards();
}

// ─── Promotion Dialog ─────────────────────────────────────────────────────
function showPromoDialog(cb) {
  const overlay = document.getElementById('promo-overlay');
  const choices = document.getElementById('promo-choices');
  choices.innerHTML = '';

  ['Q','R','B','N'].forEach((pt, i) => {
    const sq = document.createElement('div');
    sq.className = 'promo-sq';
    const pc = document.createElement('span');
    pc.className = 'pc pw';
    pc.textContent = SYM[pt];
    sq.appendChild(pc);
    sq.onclick = () => {
      overlay.classList.add('hidden');
      cb(pt.toLowerCase());
    };
    choices.appendChild(sq);
  });

  overlay.classList.remove('hidden');
}

// ─── Event Wiring ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-new').addEventListener('click', newGame);
  document.getElementById('btn-flip').addEventListener('click', flipBoard);
  document.getElementById('btn-undo').addEventListener('click', undoMove);
  document.getElementById('btn-resign').addEventListener('click', resign);
  newGame();
});
