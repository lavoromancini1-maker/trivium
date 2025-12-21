// ui-host.js
import { BOARD } from "./board.js";

let overlayTimerInterval = null;

function formatQuestionCategoryLabel(q) {
  if (!q) return "";

  if (q.scrignoMode === "FINAL") return "SCRIGNO – DOMANDA FINALE";
  if (q.scrignoMode === "CHALLENGE") return `SCRIGNO – MINI SFIDA (${q.challengeIndex || 1}/3)`;
  if (q.scrignoMode === "EXIT_POINTS") return "SCRIGNO – SOLO PUNTI (POI USCITA)";
  if (q.scrignoMode === "PICK_CATEGORY_L2_PLUS") return "SCRIGNO – DOMANDA (CATEGORIA SCELTA)";

  const cat = (q.category || "").toUpperCase();
  return `${cat} ${q.isKeyQuestion ? "– DOMANDA CHIAVE" : ""}`.trim();
}

// ===============================
// BOARD RENDER (SQUIRCLE OTTIMIZZATO & DYNAMIC FILL)
// ===============================
export function renderBoard(container) {
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "board-svg-wrap";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.classList.add("board-svg");

  // 1. VIEWBOX 1920x1080 (Full HD)
  const VW = 1920; 
  const VH = 1080; 
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // --- Definizioni Gradienti ---
  const defs = document.createElementNS(NS, "defs");
  
  // Gradiente Scrigno
  const grad = document.createElementNS(NS, "linearGradient");
  grad.setAttribute("id", "scrignoGrad");
  grad.setAttribute("x1", "0");
  grad.setAttribute("y1", "0");
  grad.setAttribute("x2", "1");
  grad.setAttribute("y2", "1");
  grad.innerHTML = `
    <stop offset="0%" stop-color="gold" />
    <stop offset="100%" stop-color="#b7791f" />
  `;
  defs.appendChild(grad);

  // Gradiente Key
  const gradKey = document.createElementNS(NS, "radialGradient");
  gradKey.setAttribute("id", "keyGrad");
  gradKey.innerHTML = `
    <stop offset="40%" stop-color="rgba(236, 201, 75, 0.25)" />
    <stop offset="100%" stop-color="rgba(236, 201, 75, 0.05)" />
  `;
  defs.appendChild(gradKey);
  
  svg.appendChild(defs);

  // Gruppi separati per i livelli (Z-Index)
  const gLines = document.createElementNS(NS, "g");
  const gTilesStandard = document.createElementNS(NS, "g");
  const gTilesPath = document.createElementNS(NS, "g");
  const gTilesKeys = document.createElementNS(NS, "g");
  
  svg.appendChild(gLines);
  svg.appendChild(gTilesStandard);
  svg.appendChild(gTilesPath);
  svg.appendChild(gTilesKeys);

  const cx = VW / 2;
  const cy = VH / 2;

  const ringCount = 42;
  const sectors = 6;

  // Parametri Geometria
  const marginX = 90;
  const marginY = 70;
  
  // Calcoliamo i raggi. Usiamo una stima di larghezza (100) solo per definire la curva.
  // La larghezza reale delle caselle verrà ricalcolata dopo.
  const ringRx = (VW / 2) - marginX - (100 / 2);
  const ringRy = (VH / 2) - marginY - (76 / 2);

  // Scrigno e Raggi
  const centerSize = 140; 
  const scrignoRadius = (centerSize / 2) + 25;

  // --- FUNZIONI UTILI ---
  function getTileStyle(tile) {
    const stroke = tile.category ? `var(--cat-${tile.category})` : "rgba(255,255,255,0.25)";
    let fill = "#1f2933";
    let strokeW = 3;

    if (tile.type === "event") fill = "var(--color-evento)";
    if (tile.type === "minigame") fill = "var(--color-minisfida)";
    if (tile.type === "key") {
       fill = "url(#keyGrad)";
       strokeW = 6;
    }
    if (tile.type === "scrigno") {
       fill = "url(#scrignoGrad)";
       strokeW = 5;
    }
    if (tile.type === "category" && tile.category) {
      fill = `color-mix(in srgb, var(--cat-${tile.category}) 30%, #111827)`;
    }
    return { fill, stroke, strokeW };
  }

  function drawLine(x1, y1, x2, y2, isKeyConnection = false) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", String(x1));
    ln.setAttribute("y1", String(y1));
    ln.setAttribute("x2", String(x2));
    ln.setAttribute("y2", String(y2));
    
    if (isKeyConnection) {
        ln.setAttribute("class", "svg-link svg-link-key");
        ln.setAttribute("stroke", "#ecc94b");
        ln.setAttribute("stroke-width", "6");
        ln.setAttribute("opacity", "0.8");
    } else {
        ln.setAttribute("class", "svg-link");
    }
    gLines.appendChild(ln);
  }

  function drawTile(tile, x, y, w, h, targetGroup) {
    const { fill, stroke, strokeW } = getTileStyle(tile);
    
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(x - w / 2));
    rect.setAttribute("y", String(y - h / 2));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    const isBranchTile = tile.zone === "branch";
    rect.setAttribute("rx", tile.type === "key" ? "16" : (isBranchTile ? String(Math.floor(h / 2)) : "10"));
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", String(strokeW));
    rect.setAttribute("class", `svg-tile svg-tile--${tile.type}`);
    rect.setAttribute("id", `tile-${tile.id}`);

    // ID
    const tId = document.createElementNS(NS, "text");
    tId.setAttribute("x", String(x));
    tId.setAttribute("y", String(y - (h/2) + 16));
    tId.setAttribute("text-anchor", "middle");
    tId.setAttribute("class", "svg-tile-id");
    tId.style.fontSize = tile.type === 'key' ? "18px" : "14px";
    tId.textContent = String(tile.id);

    // Icona/Label
    const tLabel = document.createElementNS(NS, "text");
    tLabel.setAttribute("x", String(x));
    tLabel.setAttribute("y", String(y + 12));
    tLabel.setAttribute("text-anchor", "middle");
    tLabel.setAttribute("class", "svg-tile-label");
    tLabel.style.fontSize = tile.type === 'key' ? "24px" : "16px";

    let label = "";
    if (tile.type === "key") label = "🔑";
    else if (tile.type === "event") label = "★";
    else if (tile.type === "minigame") label = "🎲";
    else if (tile.type === "scrigno") label = "🏆";
    tLabel.textContent = label;


    targetGroup.appendChild(rect);
if (!isBranchTile) targetGroup.appendChild(tId);

    targetGroup.appendChild(tLabel);

  }

  // --- CALCOLO PERIMETRO E DIMENSIONI DINAMICHE ---
  const squirclePower = 0.6; 

  function getSquircleCoord(angle, radiusX, radiusY) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const sgnCos = Math.sign(cosA);
    const sgnSin = Math.sign(sinA);
    const x = cx + radiusX * sgnCos * Math.pow(Math.abs(cosA), squirclePower);
    const y = cy + radiusY * sgnSin * Math.pow(Math.abs(sinA), squirclePower);
    return { x, y };
  }

  // 1. Campioniamo il perimetro per misurarlo
  const sampleCount = 2000;
  const samples = [];
  let totalPerimeter = 0;
  const startRad = -Math.PI / 2;

  let prevP = getSquircleCoord(startRad, ringRx, ringRy);
  samples.push({ pt: prevP, accumDist: 0 });

  for (let i = 1; i <= sampleCount; i++) {
    const angle = startRad + (i / sampleCount) * (Math.PI * 2);
    const p = getSquircleCoord(angle, ringRx, ringRy);
    const dist = Math.hypot(p.x - prevP.x, p.y - prevP.y);
    totalPerimeter += dist;
    samples.push({ pt: p, accumDist: totalPerimeter });
    prevP = p;
  }

  // 2. CALCOLO DINAMICO LARGHEZZA CASELLE
  // Dividiamo il perimetro totale per il numero di caselle (42)
  const optimalWidth = totalPerimeter / ringCount;

  // Definiamo le dimensioni finali
  // Standard: larghezza ottimale - 2px di gap. Altezza fissa.
  const tileW_Std = optimalWidth - 2; 
  const tileH_Std = 85; 

  // Chiavi: Devono essere proporzionalmente più grandi delle standard
  const tileW_Key = tileW_Std * 1.3; 
  const tileH_Key = 110; 

  // 3. Troviamo i punti equidistanti
const ringXY = [];
const stepLenPerimeter = totalPerimeter / ringCount;

// puntatore nei sample: evitiamo find() e interpoliamo tra due punti
let si = 1;

for (let i = 0; i < ringCount; i++) {
  const targetDist = i * stepLenPerimeter;

  while (si < samples.length && samples[si].accumDist < targetDist) si++;

  const a = samples[Math.max(0, si - 1)];
  const b = samples[Math.min(samples.length - 1, si)];

  const da = a.accumDist ?? 0;
  const db = b.accumDist ?? da;

  const span = Math.max(1e-6, db - da);
  const t = Math.min(1, Math.max(0, (targetDist - da) / span));

  const x = a.pt.x + (b.pt.x - a.pt.x) * t;
  const y = a.pt.y + (b.pt.y - a.pt.y) * t;

  ringXY.push({ x, y });
}

  // === FASE 1: DISEGNO LINEE PERIMETRO ===
  for (let i = 0; i < ringCount; i++) {
    const a = ringXY[i];
    const b = ringXY[(i + 1) % ringCount];
    drawLine(a.x, a.y, b.x, b.y);
  }

  // === FASE 2: DISEGNO CASELLE STANDARD (PERIMETRO) ===
  for (let i = 0; i < ringCount; i++) {
    const tile = BOARD[i];
    if (tile.type !== "key") {
      // Qui usiamo la tileW_Std calcolata dinamicamente
      drawTile(tile, ringXY[i].x, ringXY[i].y, tileW_Std, tileH_Std, gTilesStandard);
    }
  }

// === FASE 3: DISEGNO STRADINE E CONNESSIONI (NEIGHBORS-BASED) ===
const scrignoTile = BOARD.find(t => t.type === "scrigno");
const SCRIGNO_ID = scrignoTile?.id;

for (let sectorIndex = 0; sectorIndex < sectors; sectorIndex++) {
  const keyId = sectorIndex * 7;
  const keyP = ringXY[keyId];

  // trova il primo tile di branch collegato alla key
  const firstBranchId = (BOARD[keyId]?.neighbors || []).find(nid => BOARD[nid]?.zone === "branch");
  if (firstBranchId == null) continue;

  const vx = cx - keyP.x;
  const vy = cy - keyP.y;
  const distTotal = Math.hypot(vx, vy) || 1;
  const ux = vx / distTotal;
  const uy = vy / distTotal;

const isShortBranch = (sectorIndex === 0 || sectorIndex === 3);

// startDist più alto = la stradina parte più "dentro" (non passa sotto la chiave)
const startDist = distTotal * (isShortBranch ? 0.24 : 0.16);

// endDist più vicino allo scrigno = ultima casella più attaccata al centro
const endDist = distTotal - scrignoRadius * (isShortBranch ? 0.55 : 1.0);

const usable = Math.max(10, endDist - startDist);


  // raccogli tutta la catena branch: branch -> branch -> ... -> (scrigno neighbor)
  const chain = [];
  let prev = keyId;
  let cur = firstBranchId;

  // sicurezza anti-loop
  for (let guard = 0; guard < 12; guard++) {
    if (!BOARD[cur] || BOARD[cur].zone !== "branch") break;
    chain.push(cur);

    const next = (BOARD[cur].neighbors || []).find(nid => nid !== prev && (BOARD[nid]?.zone === "branch" || nid === SCRIGNO_ID));
    if (next == null || next === SCRIGNO_ID) break;

    prev = cur;
    cur = next;
  }

  const len = chain.length || 1;
  const stepLen = usable / len;

  const tileW_Path = tileW_Std * (isShortBranch ? 1.02 : 0.95);
  const tileH_Path = tileH_Std * (isShortBranch ? 0.94 : 0.88);

  let prevX = keyP.x;
  let prevY = keyP.y;

  // connessione key -> punto di start (linea gold)
  const firstStepX = keyP.x + ux * startDist;
  const firstStepY = keyP.y + uy * startDist;
  drawLine(keyP.x, keyP.y, firstStepX, firstStepY, true);

  prevX = firstStepX;
  prevY = firstStepY;

  for (let j = 0; j < chain.length; j++) {
    const tid = chain[j];
    const tile = BOARD[tid];

    const currentDist = startDist + j * stepLen;
    const x = keyP.x + ux * currentDist;
    const y = keyP.y + uy * currentDist;

    if (j > 0) drawLine(prevX, prevY, x, y);

    drawTile(tile, x, y, tileW_Path, tileH_Path, gTilesPath);

    prevX = x;
    prevY = y;
  }

  // ultima linea verso lo scrigno
  drawLine(prevX, prevY, cx, cy);
}



  // === FASE 4: DISEGNO CHIAVI (SOPRA TUTTO IL RESTO) ===
  for (let i = 0; i < ringCount; i++) {
    const tile = BOARD[i];
    if (tile.type === "key") {
      drawTile(tile, ringXY[i].x, ringXY[i].y, tileW_Key, tileH_Key, gTilesKeys);
    }
  }

  // === FASE 5: SCRIGNO CENTRALE ===
  const scrigno = BOARD.find(t => t.type === "scrigno");
if (scrigno) {
  drawTile(scrigno, cx, cy, centerSize * 1.4, centerSize, gTilesKeys);
}

  wrap.appendChild(svg);
  container.appendChild(wrap);
}

function getOverlayTopbarUI(gameState) {
  const phase = gameState?.phase || "";
  const evType = gameState?.currentEvent?.type || "";
  const revealSource = gameState?.reveal?.source || "";

  // badge sinistra: “tipo”
  let left = "❓ DOMANDA";
  if (phase.startsWith("EVENT") || evType) left = "🎲 EVENTO";
  if (evType === "DUELLO" || revealSource === "DUELLO") left = "⚔️ DUELLO";
  if (phase === "MINIGAME" || phase.startsWith("RAPID_FIRE")) left = "🎮 MINIGIOCO";

  // badge destra: “fase”
  let right = phase || "";
  if (phase === "EVENT_DUEL_QUESTION" || phase === "EVENT_QUESTION") right = "QUESTION";
  if (phase === "REVEAL") right = "REVEAL";
  if (phase === "EVENT_DUEL_CHOOSE") right = "SCEGLIE SFIDANTE";
  if (phase === "EVENT_RISK_DECISION") right = "DECISIONE";

  return { left, right };
}

/**
 * Mostra la domanda corrente in overlay sull'host.
 */
export function renderQuestionOverlay(gameState) {
    // WINNER full-screen (se attivo, non renderizzare altro overlay)
  if (renderWinnerSceneHost(gameState)) return;
  renderToastHost(gameState);
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");

  if (!overlay || !overlayContent) return;

overlay.classList.remove("correct-answer", "wrong-answer");
overlay.classList.remove("winner-mode", "winner-success", "winner-danger", "winner-neutral");

  
if (gameState && (gameState.phase === "RAPID_FIRE" || gameState.phase === "RAPID_FIRE_QUESTION")) {
  renderRapidFireOverlay(gameState);
  return;
}
 if (gameState && gameState.phase === "MINIGAME" && gameState.minigame?.type === "CLOSEST") {
  renderClosestOverlay(gameState);
  return;
} 
 if (gameState && gameState.phase === "MINIGAME" && gameState.minigame?.type === "INTRUDER") {
  renderIntruderOverlay(gameState);
  return;
} 
if (gameState && gameState.phase === "MINIGAME" && gameState.minigame?.type === "SEQUENCE") {
  renderSequenceOverlay(gameState);
  return;
}  
if (gameState && gameState.phase === "MINIGAME" && gameState.minigame?.type === "VF_FLASH") {
  renderVFFlashOverlay(gameState);
  return;
}
if (gameState && gameState.phase === "REVEAL" && gameState.reveal?.kind === "RAPID_FIRE") {
  renderRapidFireRevealOverlay(gameState);
  return;
}
if (gameState && gameState.phase === "REVEAL" && gameState.reveal?.kind === "VF_FLASH") {
  renderVFFlashRevealOverlay(gameState);
  return;
}  
if (gameState && gameState.phase === "REVEAL" && gameState.reveal && gameState.reveal.question) {
  const r = gameState.reveal;
  const q = r.question;
if (r.source === "DUELLO") {
  const answeredBy = r.answeredBy || {};
  const players = gameState.players || {};

  const entries = Object.entries(answeredBy); // [ [pid, {answerIndex, correct}] ... ]
  const anyCorrect = entries.some(([, a]) => a && a.correct === true);

  overlay.classList.remove("correct-answer", "wrong-answer");
  overlay.classList.add(anyCorrect ? "correct-answer" : "wrong-answer");

  const correctIndex = q?.correctIndex;

  const answersHtml = (q?.answers || []).map((ans, idx) => {
    const isCorrect = idx === correctIndex;
    return `
      <li class="answer-item ${isCorrect ? "answer-item--correct" : ""}">
        <span class="answer-label">${String.fromCharCode(65 + idx)}.</span>
        <span class="answer-text">${ans}</span>
      </li>
    `;
  }).join("");

  const linesHtml = entries.map(([pid, a]) => {
    const name = players?.[pid]?.name || pid;
    const letter = Number.isFinite(a?.answerIndex) ? String.fromCharCode(65 + a.answerIndex) : "—";
    const ok = a?.correct === true;
    return `<div class="duel-line">• ${name}: ${letter} ${ok ? "✅" : "❌"}</div>`;
  }).join("");

  const tb = getOverlayTopbarUI(gameState);

  overlayContent.innerHTML = `
    <div class="overlay-topbar">
  <div class="overlay-badges">
    <span class="badge">${tb.left}</span>
    <span class="badge">${tb.right}</span>
  </div>
</div>

    <div class="question-card">
      <div class="question-header">
        <div class="question-category">⚔️ DUELLO — ${(q?.category || "").toUpperCase()}</div>
        <div class="question-player">
          Esito complessivo: <strong>${anyCorrect ? "ALMENO UNO CORRETTO ✅" : "TUTTI SBAGLIATO ❌"}</strong>
        </div>
      </div>

      <div class="question-text">${q?.text || ""}</div>

      <ul class="answers-list">
        ${answersHtml}
      </ul>

      <div style="margin-top:10px; font-weight:700; opacity:.95">
        ${linesHtml || ""}
      </div>
      <div class="responders">
  ${Object.entries(r.answeredBy || {}).map(([pid, a]) => `
    <div class="responder done ${a.correct ? "is-correct" : "is-wrong"}">
      <div class="name">${gameState.players?.[pid]?.name || pid}</div>
      <div class="meta">
        ${a.correct ? "Risposta corretta ✅" : "Risposta errata ❌"}
      </div>
    </div>
  `).join("")}
</div>

    </div>
  `;

  overlay.classList.remove("hidden");
  return; // IMPORTANTISSIMO: evita di cadere nel ramo REVEAL normale
}
  const answersHtml = q.answers
    .map((ans, idx) => {
      const isCorrect = idx === q.correctIndex;
      const isChosen = r.answerIndex === idx;

      const cls = [
        "answer-item",
        isCorrect ? "answer-item--correct" : "",
        isChosen && !isCorrect ? "answer-item--chosen-wrong" : "",
        isChosen && isCorrect ? "answer-item--chosen-correct" : "",
      ].filter(Boolean).join(" ");

      return `
        <li class="${cls}">
          <span class="answer-label">${String.fromCharCode(65 + idx)}.</span>
          <span class="answer-text">${ans}</span>
        </li>
      `;
    })
    .join("");

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">
          ${formatQuestionCategoryLabel(q)}
      </div>
        <div class="question-player">
          Esito: <strong>${r.correct ? "CORRETTA ✅" : "SBAGLIATA ❌"}</strong>
        </div>
      </div>

      <div class="question-text">${q.text}</div>

      <ul class="answers-list">
        ${answersHtml}
      </ul>

      <div class="question-footer">
        <span>${r.turnContinues ? "Turno continua." : "Turno passa."}</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
  overlay.classList.toggle("correct-answer", !!r.correct);
  overlay.classList.toggle("wrong-answer", !r.correct);

  // stop timer interval (qui non serve countdown)
  if (overlayTimerInterval) {
    clearInterval(overlayTimerInterval);
    overlayTimerInterval = null;
  }
  return;
}

  // ───────────────────────────────
// EVENTI (STEP 3) - Overlay Host
// ───────────────────────────────
if (gameState && gameState.phase && gameState.phase.startsWith("EVENT")) {
  renderEventOverlay(gameState);
  return;
}

  // Se non siamo in fase QUESTION o non c'è una domanda, nascondi overlay
  if (
    !gameState ||
    gameState.phase !== "QUESTION" ||
    !gameState.currentQuestion
  ) {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";

    // stop timer se attivo
    if (overlayTimerInterval) {
      clearInterval(overlayTimerInterval);
      overlayTimerInterval = null;
    }
    return;
  }

  const q = gameState.currentQuestion;
  const players = gameState.players || {};
  const player = players[q.forPlayerId];

  const playerName = player ? player.name : "Giocatore";

  const answersHtml = q.answers
    .map(
      (ans, idx) => `
      <li class="answer-item">
        <span class="answer-label">${String.fromCharCode(65 + idx)}.</span>
        <span class="answer-text">${ans}</span>
      </li>
    `
    )
    .join("");

  // Calcolo tempo rimanente
  const now = Date.now();
  const expiresAt = q.expiresAt || (q.startedAt && q.durationSec
    ? q.startedAt + q.durationSec * 1000
    : null);

  let remainingSec = null;
  if (expiresAt) {
    remainingSec = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  }

  const timerText = remainingSec !== null ? `${remainingSec}s` : "--";

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">
          ${formatQuestionCategoryLabel(q)}
        </div>
        <div class="question-player">
          Sta rispondendo: <strong>${playerName}</strong>
        </div>
      </div>
      <div class="question-text">${q.text}</div>
      <ul class="answers-list">
        ${answersHtml}
      </ul>
      <div class="question-footer">
        <div class="question-timer">
          Tempo rimasto: <span id="question-timer-value">${timerText}</span>
        </div>
        <span>In attesa della risposta sul dispositivo del giocatore...</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");

 if (gameState.playerAnswerIndex !== undefined && gameState.playerAnswerIndex !== null) {
    const correct = q.correctIndex === gameState.playerAnswerIndex;

    if (correct) {
      overlay.classList.add("correct-answer");
    } else {
      overlay.classList.add("wrong-answer");
    }
  }
  
  // Gestione countdown visuale
  if (overlayTimerInterval) {
    clearInterval(overlayTimerInterval);
    overlayTimerInterval = null;
  }

  if (expiresAt) {
    const timerValueEl = document.getElementById("question-timer-value");
    overlayTimerInterval = setInterval(() => {
      const now2 = Date.now();
      const rem = Math.max(0, Math.ceil((expiresAt - now2) / 1000));
      if (timerValueEl) {
        timerValueEl.textContent = `${rem}s`;
      }
      if (rem <= 0) {
        clearInterval(overlayTimerInterval);
        overlayTimerInterval = null;
      }
    }, 250);
  }
}

function renderVFFlashOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  const mg = gameState.minigame;
  const idx = mg.index ?? 0;
  const stmt = mg.statements?.[idx];

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – VERO/FALSO LAMPO</div>
        <div class="question-player">Affermazione ${idx + 1}/3</div>
      </div>
      <div class="question-text">${stmt?.text || ""}</div>
      <div class="question-footer">
        <span>Il primo che risponde correttamente prende il punto.</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
}

function renderVFFlashRevealOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  const r = gameState.reveal || {};
  const stmt = r.statement || {};
  const players = gameState.players || {};
  const winnerId = r.winnerId || null;

  const correctText = stmt.correct ? "VERO" : "FALSO";
  const winnerName = winnerId ? (players?.[winnerId]?.name || "—") : null;

  // se nessuno ha preso punto: stile “rosso”
  const title = winnerName ? "FIRST CORRECT!" : "NESSUN PUNTO";

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – VERO/FALSO LAMPO</div>
        <div class="question-player">${title}</div>
      </div>

      <div class="question-text">${stmt.text || ""}</div>

      <div class="question-footer" style="display:flex;gap:12px;align-items:center;justify-content:space-between;">
        <div style="font-weight:800;">
          Risposta corretta:
          <span style="${winnerName ? "" : "color:#ff4d4d;"}">${correctText}</span>
        </div>
        <div style="opacity:.95;font-weight:700;">
          ${winnerName ? `✅ ${winnerName}` : `❌ Nessuno ha risposto correttamente`}
        </div>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
}

function renderSequenceOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  const mg = gameState.minigame;
  const now = Date.now();
  const remaining = mg.expiresAt ? Math.max(0, Math.ceil((mg.expiresAt - now) / 1000)) : "--";

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – ORDINA LA SEQUENZA</div>
        <div class="question-player">Tempo: <strong>${remaining}s</strong></div>
      </div>
      <div class="question-text">${mg.prompt || ""}</div>
      <div class="question-footer">
        <span>Ordina gli elementi dal più antico al più recente sul telefono.</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");

  if (overlayTimerInterval) clearInterval(overlayTimerInterval);
  overlayTimerInterval = setInterval(() => {
    const now2 = Date.now();
    const rem2 = mg.expiresAt ? Math.max(0, Math.ceil((mg.expiresAt - now2) / 1000)) : 0;
    const el = overlayContent.querySelector(".question-player strong");
    if (el) el.textContent = `${rem2}s`;
    if (rem2 <= 0) {
      clearInterval(overlayTimerInterval);
      overlayTimerInterval = null;
    }
  }, 250);
}

function renderIntruderOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  const mg = gameState.minigame;
  const items = mg.items || [];

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – L’INTRUSO</div>
        <div class="question-player">Tutti rispondono</div>
      </div>
      <div class="question-text">${mg.prompt || "Qual è l’intruso?"}</div>
      <div class="answers-grid">
        ${items.map((t, i) => `<div class="answer">${String.fromCharCode(65+i)}. ${t}</div>`).join("")}
      </div>
      <div class="question-footer">
        <span>Il primo che risponde correttamente prende +20.</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
}

function renderEventOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  // stop timer interval (per eventi base non facciamo countdown qui)
  if (overlayTimerInterval) {
    clearInterval(overlayTimerInterval);
    overlayTimerInterval = null;
  }

  const ev = gameState.currentEvent || {};
  const q = gameState.currentQuestion || null;

  const title =
    ev.type === "DUELLO"
      ? "EVENTO – DUELLO"
      : ev.type === "BOOM"
      ? "EVENTO – DOMANDA BOOM"
      : ev.type === "RISK"
      ? "EVENTO – RISCHIA O VINCI"
      : "EVENTO";

  // blocco contenuto variabile in base alla phase
  let bodyHtml = "";

  if (gameState.phase === "EVENT_RISK_DECISION") {
    bodyHtml = `
      <div class="question-text">
        Il giocatore sta decidendo se partecipare (SÌ/NO)…
      </div>
      <div class="question-footer">
        <span>In attesa della scelta sul dispositivo del giocatore.</span>
      </div>
    `;
  } else if (gameState.phase === "EVENT_DUEL_CHOOSE") {
    bodyHtml = `
      <div class="question-text">
        Il giocatore sta scegliendo lo sfidante…
      </div>
      <div class="question-footer">
        <span>In attesa della scelta sul dispositivo del giocatore.</span>
      </div>
    `;
  } else if (gameState.phase === "EVENT_QUESTION" || gameState.phase === "EVENT_DUEL_QUESTION") {
    if (!q) {
      bodyHtml = `
        <div class="question-text">Caricamento domanda evento…</div>
      `;
    } else {
      const answersHtml = (q.answers || [])
        .map(
          (ans, idx) => `
          <li class="answer-item">
            <span class="answer-label">${String.fromCharCode(65 + idx)}.</span>
            <span class="answer-text">${ans}</span>
          </li>
        `
        )
        .join("");

      // Info extra duello (round + score live)
      let duelInfo = "";
      if (ev.type === "DUELLO") {
        const round = (ev.roundIndex ?? 0) + 1;
        const total = ev.totalRounds ?? 3;

        const players = gameState.players || {};
        const ownerName = players[ev.ownerPlayerId]?.name || "Owner";
        const oppName = players[ev.opponentPlayerId]?.name || "Sfidante";

        const sOwner = (ev.score && ev.ownerPlayerId) ? (ev.score[ev.ownerPlayerId] || 0) : 0;
        const sOpp = (ev.score && ev.opponentPlayerId) ? (ev.score[ev.opponentPlayerId] || 0) : 0;

        duelInfo = `
          <div class="question-player">
            Round <strong>${round}/${total}</strong> — 
            <strong>${ownerName}</strong>: ${sOwner} | <strong>${oppName}</strong>: ${sOpp}
          </div>
        `;
      }

      bodyHtml = `
        <div class="question-header">
          <div class="question-category">
            ${q.category ? q.category.toUpperCase() : "CATEGORIA"} 
            ${ev.type === "DUELLO" ? "– DUELLO" : ""}
          </div>
          ${duelInfo}
        </div>

        <div class="question-text">${q.text || ""}</div>

        <ul class="answers-list">
          ${answersHtml}
        </ul>

        <div class="question-footer">
          <span>In attesa delle risposte dai dispositivi...</span>
        </div>
      `;
    }
  } else {
    bodyHtml = `
      <div class="question-text">Evento in corso…</div>
    `;
  }

  const tb = getOverlayTopbarUI(gameState);

overlayContent.innerHTML = `
  <div class="question-card">
    <div class="overlay-topbar">
      <div class="overlay-badges">
        <span class="badge">${tb.left}</span>
        <span class="badge">${tb.right}</span>
      </div>
    </div>

    ${gameState.phase === "EVENT_QUESTION" || gameState.phase === "EVENT_DUEL_QUESTION"
      ? ""
      : `
        <div class="question-header">
          <div class="question-category">${title}</div>
        </div>
      `
    }

    ${bodyHtml}
  </div>
`;


  overlay.classList.remove("hidden");
}

function renderRapidFireScoreboardHtml(gameState) {
  const rf = gameState.rapidFire || {};
  const players = gameState.players || {};

  const scores = rf.scores || {};
  const timesMs = rf.timesMs || {};

  const rows = Object.keys(players).map((pid) => ({
    pid,
    name: players?.[pid]?.name || pid,
    score: Number(scores[pid] ?? 0),
    time: Number(timesMs[pid] ?? 0),
  }));

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.time - b.time;
  });

  return `
    <div class="rf-scoreboard">
      <div class="rf-scoreboard-title">CLASSIFICA</div>
      ${rows
        .map((r, i) => {
          const lead = i === 0 ? " rf-row--lead" : "";
          return `
            <div class="rf-row${lead}">
              <div class="rf-pos">${i + 1}</div>
              <div class="rf-name">${r.name}</div>
              <div class="rf-score">${r.score}</div>
              <div class="rf-time">${(r.time / 1000).toFixed(2)}s</div>
            </div>
          `;
        })
        .join("")}
      <div class="rf-scoreboard-sub">Tie-break: a parità di corrette vince il tempo minore.</div>
    </div>
  `;
}

export function renderRapidFireOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");

  if (!overlay || !overlayContent) return;

  const rapidFire = gameState.rapidFire;
if (
  !rapidFire ||
  (gameState.phase !== "RAPID_FIRE" && gameState.phase !== "RAPID_FIRE_QUESTION") ||
  !rapidFire.questions ||
  rapidFire.questions.length === 0
) {
  overlay.classList.add("hidden");
  overlayContent.innerHTML = "";

  if (overlayTimerInterval) {
    clearInterval(overlayTimerInterval);
    overlayTimerInterval = null;
  }

  return;
}


  const currentIndex = rapidFire.currentIndex ?? 0;
  const question = rapidFire.questions[currentIndex];

  const answersHtml = question.answers
    .map(
      (ans, idx) => `
      <li class="answer-item">
        <span class="answer-label">${String.fromCharCode(65 + idx)}.</span>
        <span class="answer-text">${ans}</span>
      </li>
    `
    )
    .join("");

  const now = Date.now();
  const expiresAt = rapidFire.expiresAt;
  let remainingSec = null;
  if (expiresAt) {
    remainingSec = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  }
  const timerText = remainingSec !== null ? `${remainingSec}s` : "--";

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – RAPID FIRE</div>
        <div class="question-player">
          Domanda ${currentIndex + 1}/${rapidFire.questions.length}
        </div>
      </div>
      <div class="question-text">${question.text}</div>
      <ul class="answers-list">
        ${answersHtml}
      </ul>
      <div class="question-footer">
        <div class="question-timer">
          Tempo rimasto: <span id="rapidfire-timer-value">${timerText}</span>
        </div>
        <span>Tutti i giocatori rispondono dai loro dispositivi.</span>
      </div>

      ${renderRapidFireScoreboardHtml(gameState)}
    </div>
  `;

  overlay.classList.remove("hidden");

  // gestiamo il countdown visuale
  if (overlayTimerInterval) {
    clearInterval(overlayTimerInterval);
    overlayTimerInterval = null;
  }

  if (expiresAt) {
    const timerValueEl = document.getElementById("rapidfire-timer-value");
    overlayTimerInterval = setInterval(() => {
      const now2 = Date.now();
      const rem = Math.max(0, Math.ceil((expiresAt - now2) / 1000));
      if (timerValueEl) {
        timerValueEl.textContent = `${rem}s`;
      }
      if (rem <= 0) {
        clearInterval(overlayTimerInterval);
        overlayTimerInterval = null;
      }
    }, 250);
  }
}

function renderRapidFireRevealOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  const r = gameState.reveal || {};
  const q = r.question || {};
  const players = gameState.players || {};
  const correctPlayers = Array.isArray(r.correctPlayers) ? r.correctPlayers : [];

  const correctNames = correctPlayers
    .map((pid) => players?.[pid]?.name || "—")
    .slice(0, 6)
    .join(" • ");

  const correctIndex = Number(q.correctIndex ?? -1);

  const answers = Array.isArray(q.answers) ? q.answers : [];
  const answersHtml = answers
    .map((a, i) => {
      const isCorrect = i === correctIndex;
      return `<li class="answer-item ${isCorrect ? "correct" : ""}">
        <span class="answer-letter">${String.fromCharCode(65 + i)}</span>
        <span class="answer-text">${a}</span>
      </li>`;
    })
    .join("");

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – RAPID FIRE</div>
        <div class="question-player">RISULTATO</div>
      </div>

      <div class="question-text">${q.text || ""}</div>
      <ul class="answers-list">${answersHtml}</ul>

      <div class="question-footer" style="display:flex;gap:12px;align-items:center;justify-content:space-between;">
        <div style="font-weight:700;">
          ${correctPlayers.length ? "✅ Corretti:" : "❌ Nessuno corretto"}
        </div>
        <div style="opacity:.9;">
          ${correctPlayers.length ? correctNames : "Risposta mostrata in verde"}
        </div>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
}

export function renderPlayers(gameState) {
  const leftCol = document.getElementById("players-left");
  const rightCol = document.getElementById("players-right");

  if (!leftCol || !rightCol) return;

  leftCol.innerHTML = "";
  rightCol.innerHTML = "";

  const playersObj = gameState?.players || {};
  const turnOrder = gameState?.turnOrder || Object.keys(playersObj);
  const currentPlayerId = gameState?.currentPlayerId || null;

  const ids = turnOrder.filter(id => playersObj[id]).slice(0, 8);

  const CATS = ["geografia", "storia", "arte", "sport", "spettacolo", "scienza"];

  ids.forEach((pid, index) => {
    const p = playersObj[pid];

    const card = document.createElement("div");
    card.className =
      "player-card" + (pid === currentPlayerId ? " player-card--active" : "");

    const keys = p?.keys || {};

    const keysHtml = CATS.map(cat => {
      const on = !!keys[cat];
      return `<span class="key-dot key-dot--${cat} ${on ? "key-dot--on" : ""}"></span>`;
    }).join("");

    card.innerHTML = `
      <div class="player-card__name">${p?.name || "Player"}</div>
      <div class="player-card__points">${p?.points ?? 0} pts</div>
      <div class="player-card__keys">${keysHtml}</div>
    `;

    // primi 4 a sinistra, altri a destra
    if (index < 4) leftCol.appendChild(card);
    else rightCol.appendChild(card);
  });
}

function countKeys(player) {
  const keys = player?.keys || {};
  return Object.values(keys).filter(Boolean).length;
}

function formatPosition(position) {
  if (position === undefined || position === null) return "--";

  const tile = BOARD[position];
  if (!tile) return position;

  const typeLabel =
    tile.type === "category"
      ? `categoria ${tile.category}`
      : tile.type === "key"
      ? `chiave ${tile.category}`
      : tile.type === "minigame"
      ? "minigioco"
      : tile.type === "event"
      ? "evento"
      : tile.type === "scrigno"
      ? "scrigno"
      : tile.type;

  return `${position} (${typeLabel})`;
}
function renderClosestOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return;

  const mg = gameState.minigame;
  const now = Date.now();
  const remaining = mg.expiresAt ? Math.max(0, Math.ceil((mg.expiresAt - now) / 1000)) : "--";

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">MINIGIOCO – PIÙ VICINO VINCE</div>
        <div class="question-player">Tempo: <strong>${remaining}s</strong></div>
      </div>
      <div class="question-text">${mg.challenge?.text || ""}</div>
      <div class="question-footer">
        <span>Tutti inseriscono un numero dal telefono. Vince chi è più vicino.</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");

  // aggiorna countdown live
  if (overlayTimerInterval) clearInterval(overlayTimerInterval);
  overlayTimerInterval = setInterval(() => {
    const now2 = Date.now();
    const rem2 = mg.expiresAt ? Math.max(0, Math.ceil((mg.expiresAt - now2) / 1000)) : 0;
    const el = overlayContent.querySelector(".question-player strong");
    if (el) el.textContent = `${rem2}s`;
    if (rem2 <= 0) {
      clearInterval(overlayTimerInterval);
      overlayTimerInterval = null;
    }
  }, 250);
}

// ===============================
// BOARD HIGHLIGHT (player positions + spotlight direzioni)
// ===============================
export function updateBoardHighlights(gameState) {
  const allRects = document.querySelectorAll("rect.svg-tile");

  // reset classi
  allRects.forEach(r =>
    r.classList.remove(
      "svg-tile--occupied",
      "svg-tile--active",
      "svg-tile--pulse",
      "svg-tile--dim"
    )
  );

  if (!gameState) return;

  const players = gameState.players || {};
  const currentPlayerId = gameState.currentPlayerId || null;

  // 1) evidenzia posizioni player
  for (const [pid, p] of Object.entries(players)) {
    const pos = p?.position;
    if (pos === undefined || pos === null) continue;

    const rect = document.getElementById(`tile-${pos}`);
    if (!rect) continue;

    rect.classList.add("svg-tile--occupied");
    if (pid === currentPlayerId) rect.classList.add("svg-tile--active");
  }

  // 2) spotlight: in CHOOSE_DIRECTION pulsa SOLO opzioni e attenua il resto
  if (gameState.phase === "CHOOSE_DIRECTION") {
    const dirs = gameState.availableDirections || [];
    const optionIds = new Set(
      dirs
        .map(d => d?.previewTileId)
        .filter(v => v !== undefined && v !== null)
    );

    // attenua TUTTE le caselle che non sono opzioni
    allRects.forEach((rect) => {
      const id = rect.id || "";
      const tid = Number(id.replace("tile-", ""));
      if (!Number.isFinite(tid)) return;

      if (!optionIds.has(tid)) rect.classList.add("svg-tile--dim");
    });

    // pulsa SOLO le opzioni (e non attenuarle)
    optionIds.forEach((tid) => {
      const rect = document.getElementById(`tile-${tid}`);
      if (!rect) return;
      rect.classList.remove("svg-tile--dim");
      rect.classList.add("svg-tile--pulse");
    });

    // mantieni sempre visibili i player (se non sono opzioni)
    for (const p of Object.values(players)) {
      const pos = p?.position;
      if (pos === undefined || pos === null) continue;
      const rect = document.getElementById(`tile-${pos}`);
      if (!rect) continue;
      rect.classList.remove("svg-tile--dim");
    }
  }
}

function ensureToastEl() {
  let el = document.getElementById("trivium-toast");
  if (el) return el;

  el = document.createElement("div");
  el.id = "trivium-toast";
  el.className = "trivium-toast hidden neutral";
  el.innerHTML = `
    <div class="title"></div>
    <div class="subtitle"></div>
  `;
  document.body.appendChild(el);
  return el;
}

function shouldShowWinnerScene(gameState) {
  const toast = gameState?.toast;
  if (!toast?.host?.title || !toast?.hideAt) return false;
  if (Date.now() > toast.hideAt) return false;

  // Mostriamo “winner screen” solo per toast “di fine” (evento/duello/minigiochi)
  const t = (toast.host.title || "").toLowerCase();
  return (
    t.includes("concluso") ||
    t.includes("duello") ||
    t.includes("evento") ||
    t.includes("minigioco") ||
    t.includes("risultato")
  );
}

function renderWinnerSceneHost(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");
  if (!overlay || !overlayContent) return false;

  if (!shouldShowWinnerScene(gameState)) return false;

  const toast = gameState.toast;
  const kind = toast.host.kind || "neutral";
  const title = toast.host.title || "";
  const subtitle = toast.host.subtitle || "";

  overlay.classList.remove("hidden");
  overlay.classList.remove("winner-success", "winner-danger", "winner-neutral");
  overlay.classList.add("winner-mode", `winner-${kind}`);

  overlayContent.innerHTML = `
    <div class="winner-screen">
      <div class="winner-title">${title}</div>
      <div class="winner-subtitle">${subtitle}</div>
      <div class="winner-spark"></div>
    </div>
  `;
  return true;
}

function renderToastHost(gameState) {
  const toast = gameState?.toast || null;
  const el = ensureToastEl();

  if (!toast || !toast.host || !toast.hideAt || Date.now() > toast.hideAt) {
    el.classList.add("hidden");
    return;
  }

  const kind = toast.host.kind || "neutral";
  el.classList.remove("hidden", "success", "danger", "neutral");
  el.classList.add(kind);

  el.querySelector(".title").textContent = toast.host.title || "";
  el.querySelector(".subtitle").textContent = toast.host.subtitle || "";
}
