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

if (gameState && (gameState.phase === "RAPID_FIRE" || gameState.phase === "RAPID_FIRE_QUESTION")) {
  renderRapidFireOverlay(gameState);
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

      li.innerHTML = `
        <div class="player-name">${player.name || "Senza nome"}</div>
        <div class="player-info">
          <span>Punti: ${player.points ?? 0}</span><br>
          <span>Chiavi: ${Object.values(player.keys).filter((k) => k).length}/6</span>
        </div>
      `;
      ul.appendChild(li);
    }
  }

  container.appendChild(ul);
}
