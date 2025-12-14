// ui-host.js
import { BOARD } from "./board.js";

let overlayTimerInterval = null;

/**
 * Inizializza il tabellone nell'elemento container.
 * Per ora lo disegniamo come una semplice griglia rettangolare,
 * giusto per vedere tutte le caselle e i colori.
 */
export function renderBoard(container) {
  // Svuota content
  container.innerHTML = "";

  // Crea wrapper
  const boardEl = document.createElement("div");
  boardEl.className = "board-grid";

  BOARD.forEach((tile) => {
    const tileEl = document.createElement("div");
    tileEl.classList.add("tile");

    // Classi per tipo
    tileEl.classList.add(`tile--${tile.type}`); // tile--category, tile--key, tile--event, tile--minigame, tile--scrigno

    // Classi per categoria (se presente)
    if (tile.category) {
      tileEl.classList.add(`tile--cat-${tile.category}`);
    }

    // Testo di debug dentro la casella
    // Esempio: "0\nGEOGRAFIA" oppure "12\nEVENTO"
    const labelId = document.createElement("div");
    labelId.className = "tile-id";
    labelId.textContent = tile.id;

    const labelType = document.createElement("div");
    labelType.className = "tile-type";
    labelType.textContent =
      tile.type === "category"
        ? tile.category
        : tile.type === "key"
        ? `CHIAVE\n${tile.category}`
        : tile.type.toUpperCase();

    tileEl.appendChild(labelId);
    tileEl.appendChild(labelType);

    boardEl.appendChild(tileEl);
  });

  container.appendChild(boardEl);
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
          ${q.category.toUpperCase()} ${q.isKeyQuestion ? "– DOMANDA CHIAVE" : ""}
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
        <span>${r.correct ? "Turno continua." : "Turno passa."}</span>
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
          ${q.category.toUpperCase()} ${q.isKeyQuestion ? "– DOMANDA CHIAVE" : ""}
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

