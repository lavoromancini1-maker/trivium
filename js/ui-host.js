// ui-host.js
import { BOARD } from "./board.js";

let overlayTimerInterval = null;

function formatQuestionCategoryLabel(q) {
  if (!q) return "";

  if (q.scrignoMode === "FINAL") return "SCRIGNO – DOMANDA FINALE";
  if (q.scrignoMode === "CHALLENGE") return `SCRIGNO – MINI SFIDA (${q.challengeIndex || 1}/3)`;
  if (q.scrignoMode === "EXIT_POINTS") return "SCRIGNO – SOLO PUNTI (POI USCITA)";

  const cat = (q.category || "").toUpperCase();
  return `${cat} ${q.isKeyQuestion ? "– DOMANDA CHIAVE" : ""}`.trim();
}

// ===============================
// BOARD RENDER (SVG circolare)
// ===============================
export function renderBoard(container) {
  container.innerHTML = "";

  // Wrapper responsivo (quadrato)
  const wrap = document.createElement("div");
  wrap.className = "board-svg-wrap";

  // SVG base (viewBox quadrato)
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.classList.add("board-svg");
  svg.setAttribute("viewBox", "0 0 1000 1000");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Defs (gradient scrigno)
  const defs = document.createElementNS(NS, "defs");
  const grad = document.createElementNS(NS, "linearGradient");
  grad.setAttribute("id", "scrignoGrad");
  grad.setAttribute("x1", "0");
  grad.setAttribute("y1", "0");
  grad.setAttribute("x2", "1");
  grad.setAttribute("y2", "1");

  const s1 = document.createElementNS(NS, "stop");
  s1.setAttribute("offset", "0%");
  s1.setAttribute("stop-color", "gold");
  const s2 = document.createElementNS(NS, "stop");
  s2.setAttribute("offset", "100%");
  s2.setAttribute("stop-color", "#b7791f");

  grad.appendChild(s1);
  grad.appendChild(s2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Layer per linee (sotto) e tiles (sopra)
  const gLines = document.createElementNS(NS, "g");
  gLines.setAttribute("class", "board-lines");
  const gTiles = document.createElementNS(NS, "g");
  gTiles.setAttribute("class", "board-tiles");

  svg.appendChild(gLines);
  svg.appendChild(gTiles);

  // --- Geometria ---
  const cx = 500;
  const cy = 500;

  const ringCount = 42;          // 6 settori * 7
  const branchLen = 5;           // per settore
  const sectors = 6;

  const ringR = 390;             // raggio anello
  const branchStep = 62;         // distanza tra caselle stradina
  const branchStartR = ringR - 82; // prima casella verso il centro (staccata dalla key)
  const centerSize = 150;

  const tileW = 70;
  const tileH = 56;
  const tileRx = 14;

  const angle0 = -Math.PI / 2;   // start in alto (12 o'clock)
  const step = (Math.PI * 2) / ringCount;

  // Helper: colore casella
  function getTileStyle(tile) {
    // stroke in base a categoria (se presente)
    const stroke = tile.category ? `var(--cat-${tile.category})` : "rgba(255,255,255,0.22)";

    // fill in base a tipo
    let fill = "#1f2933";
    if (tile.type === "event") fill = "var(--color-evento)";
    if (tile.type === "minigame") fill = "var(--color-minisfida)";
    if (tile.type === "key") fill = "rgba(236,201,75,0.12)";
    if (tile.type === "scrigno") fill = "url(#scrignoGrad)";

    // stroke più “forte” per key/scrigno
    const strokeW = tile.type === "key" ? 4 : tile.type === "scrigno" ? 4 : 3;

    return { fill, stroke, strokeW };
  }

  // Helper: disegna una casella (rettangolo + testo)
  function drawTile(tile, x, y, w = tileW, h = tileH) {
    const { fill, stroke, strokeW } = getTileStyle(tile);

    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(x - w / 2));
    rect.setAttribute("y", String(y - h / 2));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", String(tileRx));
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", String(strokeW));
    rect.setAttribute("opacity", "0.98");
    rect.setAttribute("class", `svg-tile svg-tile--${tile.type}`);

    // ID (piccolo)
    const tId = document.createElementNS(NS, "text");
    tId.setAttribute("x", String(x));
    tId.setAttribute("y", String(y - 6));
    tId.setAttribute("text-anchor", "middle");
    tId.setAttribute("class", "svg-tile-id");
    tId.textContent = String(tile.id);

    // Label (grande)
    const tLabel = document.createElementNS(NS, "text");
    tLabel.setAttribute("x", String(x));
    tLabel.setAttribute("y", String(y + 14));
    tLabel.setAttribute("text-anchor", "middle");
    tLabel.setAttribute("class", "svg-tile-label");

    let label = "";
    if (tile.type === "category") label = tile.category || "";
    else if (tile.type === "key") label = `CHIAVE ${tile.category || ""}`;
    else if (tile.type === "event") label = "EVENT";
    else if (tile.type === "minigame") label = "MINIGAME";
    else if (tile.type === "scrigno") label = "SCRIGNO";
    else label = tile.type;

    tLabel.textContent = label;

    gTiles.appendChild(rect);
    gTiles.appendChild(tId);
    gTiles.appendChild(tLabel);
  }

  // Helpr: linea
  function drawLine(x1, y1, x2, y2) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", String(x1));
    ln.setAttribute("y1", String(y1));
    ln.setAttribute("x2", String(x2));
    ln.setAttribute("y2", String(y2));
    ln.setAttribute("class", "svg-link");
    gLines.appendChild(ln);
  }

  // --- 1) Ring (0..41) ---
  for (let i = 0; i < ringCount; i++) {
    const tile = BOARD[i];
    const a = angle0 + i * step;
    const x = cx + ringR * Math.cos(a);
    const y = cy + ringR * Math.sin(a);

    drawTile(tile, x, y);

    // linea tra questa e la prossima (per dare “anello” visivo)
    const a2 = angle0 + ((i + 1) % ringCount) * step;
    const x2 = cx + ringR * Math.cos(a2);
    const y2 = cy + ringR * Math.sin(a2);
    drawLine(x, y, x2, y2);
  }

  // --- 2) Branches (42..71): 6 stradine, una per ogni key (id 0,7,14,21,28,35) ---
  for (let sectorIndex = 0; sectorIndex < sectors; sectorIndex++) {
    const keyId = sectorIndex * 7; // come in board.js
    const keyAngle = angle0 + keyId * step;

    // coordinate key sul ring
    const kx = cx + ringR * Math.cos(keyAngle);
    const ky = cy + ringR * Math.sin(keyAngle);

    // base branch
    const branchBase = 42 + sectorIndex * branchLen;

    // linea “spina” dalla key verso il centro
    let prevX = kx;
    let prevY = ky;

    for (let j = 0; j < branchLen; j++) {
      const tid = branchBase + j;
      const tile = BOARD[tid];

      const r = branchStartR - j * branchStep;
      const x = cx + r * Math.cos(keyAngle);
      const y = cy + r * Math.sin(keyAngle);

      drawLine(prevX, prevY, x, y);
      drawTile(tile, x, y);

      prevX = x;
      prevY = y;
    }

    // collega ultima casella al centro (solo linea)
    drawLine(prevX, prevY, cx, cy);
  }

  // --- 3) Centro scrigno (72) ---
  const scrigno = BOARD[72];
  drawTile(scrigno, cx, cy, centerSize, centerSize);

  wrap.appendChild(svg);
  container.appendChild(wrap);
}

/**
 * Mostra la domanda corrente in overlay sull'host.
 */
export function renderQuestionOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");

  if (!overlay || !overlayContent) return;

overlay.classList.remove("correct-answer", "wrong-answer");
  
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
if (gameState && gameState.phase === "REVEAL" && gameState.reveal && gameState.reveal.question) {
  const r = gameState.reveal;
  const q = r.question;

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

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">${title}</div>
      </div>
      ${bodyHtml}
    </div>
  `;

  overlay.classList.remove("hidden");
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

export function renderPlayers(gameState, container) {
  container.innerHTML = "";

  const playersObj = gameState.players || {};
  const turnOrder = gameState.turnOrder || [];
  const currentPlayerId = gameState.currentPlayerId || null;

  const playerEntries = Object.entries(playersObj);

  if (playerEntries.length === 0) {
    container.textContent = "Nessun giocatore connesso.";
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "players-list";

  if (turnOrder.length > 0) {
    for (const pid of turnOrder) {
      const player = playersObj[pid];
      if (!player) continue;
      const li = document.createElement("li");
      li.className = "players-list-item";
      if (pid === currentPlayerId) {
        li.classList.add("players-list-item--active");
      }

      // Generazione dell'HTML per il livello e le chiavi
      const levelsHtml = Object.keys(player.levels).map(category => {
        const level = player.levels[category] || 0;
        const hasKey = player.keys[category] ? "✔️" : "❌"; // Icona chiave
        return `
          <div class="player-level-info">
            <span class="category-name">${category}</span> 
            <span class="level-bar" style="width: ${level * 25}%"></span> 
            <span class="key-icon">${hasKey}</span>
          </div>
        `;
      }).join("");

      li.innerHTML = `
        <div class="player-name">${player.name || "Senza nome"}</div>
        <div class="player-info">
          <span>Punti: ${player.points ?? 0}</span><br>
          <span>Chiavi: ${countKeys(player)}/6</span><br>
          <span>Casella: ${formatPosition(player.position)}</span>
        </div>
        <div class="player-levels">
          ${levelsHtml} <!-- Mostra i livelli e le chiavi -->
        </div>
      `;
      ul.appendChild(li);
    }
  }

  container.appendChild(ul);
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

