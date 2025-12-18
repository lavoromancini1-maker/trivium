import {
  renderBoard,
  renderQuestionOverlay,
  renderPlayers,
  updateBoardHighlights
} from "./ui-host.js";

import {
  createGame,
  listenGame,
  startGame,
  checkAndHandleQuestionTimeout,
  checkAndHandleRapidFireTimeout,
  checkAndHandleRevealAdvance,
  checkAndHandleMinigameTimeout,
  touchHostPresence,
} from "./firebase-game.js";

let currentGameCode = null;
let unsubscribeGame = null;
let timeoutIntervalId = null;
let currentGameState = null;

let hostHeartbeatId = null;

function startHostHeartbeat(gameCode) {
  if (hostHeartbeatId) clearInterval(hostHeartbeatId);

  // ping immediato
  touchHostPresence(gameCode);

  // ping periodico
  hostHeartbeatId = setInterval(() => {
    touchHostPresence(gameCode);
  }, 15000); // ogni 15s
}

// evita doppio render del board
let boardRendered = false;

document.addEventListener("DOMContentLoaded", () => {
  // VIEW
  const hallView = document.getElementById("host-hall");
  const gameView = document.getElementById("host-game");

  // HALL UI
  const createGameBtn = document.getElementById("create-game-btn");
  const startGameBtn = document.getElementById("start-game-btn");
  const gameCodeDisplay = document.getElementById("game-code-display");
  const hallMessageEl = document.getElementById("game-message");
  const qrBox = document.getElementById("qr-code");

  // GAME UI
  const boardContainer = document.getElementById("board-container");
  const messageTextEl = document.getElementById("message-text");

  if (!hallView || !gameView) {
    console.error("host.html: manca #host-hall o #host-game");
    return;
  }

  if (!createGameBtn || !startGameBtn || !gameCodeDisplay) {
    console.error("host.html: mancano elementi hall (create/start/code)");
    return;
  }

  if (!boardContainer || !messageTextEl) {
    console.error("host.html: mancano #board-container o #message-text");
    return;
  }

  // Stato iniziale
  showHall();

  createGameBtn.addEventListener("click", async () => {
    try {
      createGameBtn.disabled = true;
      createGameBtn.textContent = "Creazione in corso...";

      const { gameCode } = await createGame();
      currentGameCode = gameCode;

      startHostHeartbeat(gameCode);

      // UI Hall
      gameCodeDisplay.textContent = gameCode;
      if (hallMessageEl) hallMessageEl.textContent = "Condividi il codice con i giocatori e poi avvia la partita.";
      startGameBtn.disabled = false;
      createGameBtn.textContent = "Partita creata";

      // QR
      if (qrBox) renderQrInto(qrBox, gameCode);

      // Listener realtime
      if (unsubscribeGame) unsubscribeGame();
      unsubscribeGame = listenGame(gameCode, (gameState) => {
        if (!gameState) {
          if (hallMessageEl) hallMessageEl.textContent = "Partita non trovata.";
          messageTextEl.textContent = "Partita non trovata.";
          return;
        }

currentGameState = gameState;

// ✅ Se la partita è partita (o conclusa), l’host deve uscire dalla Hall AUTOMATICAMENTE
const shouldShowGame = gameState.state === "IN_PROGRESS" || gameState.state === "ENDED";
if (shouldShowGame) {
  showGame();

  // render board solo la prima volta
  if (!boardRendered) {
    renderBoard(boardContainer);
    boardRendered = true;
  }
}

// aggiorna UI (anche se stai ancora in Hall, non fa danni)
renderPlayers(gameState);
updateBoardHighlights(gameState);
renderGameMessage(gameState, messageTextEl);
renderQuestionOverlay(gameState);
      });

      // timeout checks
      setupTimeoutInterval();

    } catch (err) {
      console.error(err);
      alert("Errore nella creazione della partita.");
      createGameBtn.disabled = false;
      createGameBtn.textContent = "Crea nuova partita";
    }
  });

  startGameBtn.addEventListener("click", async () => {
    if (!currentGameCode) return;

    try {
      startGameBtn.disabled = true;
      startGameBtn.textContent = "Avvio in corso...";

      await startGame(currentGameCode);

      // Mostra la game view (board + overlay + footer)
      showGame();

      // Render board SOLO quando entri nella game view
      if (!boardRendered) {
        renderBoard(boardContainer);
        boardRendered = true;

        // se c'è già uno state, applica subito highlights
        if (currentGameState) {
          renderPlayers(currentGameState);
          updateBoardHighlights(currentGameState);
          renderQuestionOverlay(currentGameState);
        }
      }

      startGameBtn.textContent = "Partita avviata";
   } catch (err) {
  console.error(err);

  // ✅ Se la partita è già partita, non blocchiamo l’host in Hall
  if (currentGameState && currentGameState.state === "IN_PROGRESS") {
    showGame();
    if (!boardRendered) {
      renderBoard(boardContainer);
      boardRendered = true;
    }
    startGameBtn.textContent = "Partita avviata";
    return;
  }

  alert(err.message || "Errore nell'avvio della partita.");
  startGameBtn.disabled = false;
  startGameBtn.textContent = "Avvia partita";
}
  });

  function showHall() {
    hallView.classList.remove("hidden");
    gameView.classList.add("hidden");
  }

  function showGame() {
    hallView.classList.add("hidden");
    gameView.classList.remove("hidden");
  }
});

function renderGameMessage(gameState, messageEl) {
  const state = gameState.state || "LOBBY";

  if (state === "LOBBY") {
    messageEl.textContent =
      "In attesa dei giocatori. Premi 'Avvia partita' quando sei pronto.";
    return;
  }

  if (state === "IN_PROGRESS") {
    const currentPlayerId = gameState.currentPlayerId;
    const players = gameState.players || {};
    const currentPlayer = players[currentPlayerId];
    const phase = gameState.phase;
    const currentTile = gameState.currentTile || null;

    if (phase === "RAPID_FIRE" && currentTile?.type === "minigame") {
      const name = currentPlayer ? currentPlayer.name : "un giocatore";
      messageEl.textContent = `Mini-sfida RAPID FIRE in corso! ${name} ha attivato il minigioco, tutti stanno rispondendo.`;
      return;
    }

    if (phase === "MINIGAME_PENDING" && currentTile?.type === "minigame") {
      const name = currentPlayer ? currentPlayer.name : "un giocatore";
      messageEl.textContent = `Mini-sfida! ${name} è finito su una casella MINI GAME. (placeholder, logica in arrivo 👾)`;
      return;
    }

    if (currentPlayer) {
      messageEl.textContent = `Tocca a ${currentPlayer.name}.`;
    } else {
      messageEl.textContent = "Partita in corso.";
    }
    return;
  }

  messageEl.textContent = "Stato: " + state;
}

function setupTimeoutInterval() {
  if (timeoutIntervalId) {
    clearInterval(timeoutIntervalId);
    timeoutIntervalId = null;
  }

  if (!currentGameCode) return;

  timeoutIntervalId = setInterval(async () => {
    try {
      const res = await checkAndHandleQuestionTimeout(currentGameCode);
      if (res && res.handled) console.log("⏰ Timeout domanda gestito automaticamente:", res.reason);

      const resReveal = await checkAndHandleRevealAdvance(currentGameCode);
      if (resReveal && resReveal.handled) console.log("✅ Reveal chiuso:", resReveal.reason);

      const resRF = await checkAndHandleRapidFireTimeout(currentGameCode);
      if (resRF && resRF.handled) console.log("⏰ Rapid Fire avanzato:", resRF.reason);

      const resMg = await checkAndHandleMinigameTimeout(currentGameCode);
      if (resMg && resMg.handled) console.log("⏰ Minigioco chiuso per timeout");
    } catch (err) {
      console.error("Errore nel controllo timeout:", err);
    }
  }, 500);
}

/**
 * QR semplice: usiamo un servizio image QR (zero librerie).
 * Genera un QR per aprire player.html con codice precompilato (?game=XXXXXX).
 */
function renderQrInto(targetEl, gameCode) {
  const base = window.location.origin + window.location.pathname.replace(/host\.html$/i, "");
  const playerUrl = `${base}player.html?gameCode=${encodeURIComponent(gameCode)}`;

  // QR image (220x220)
  const qrImgUrl =
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(playerUrl)}`;

  targetEl.innerHTML = `
    <img src="${qrImgUrl}" alt="QR code per entrare in partita" width="220" height="220" style="display:block;border-radius:12px;">
    <div style="margin-top:8px;font-size:12px;opacity:0.85;word-break:break-all;text-align:center;">
      ${playerUrl}
    </div>
  `;
}

window.addEventListener("beforeunload", () => {
  if (timeoutIntervalId) clearInterval(timeoutIntervalId);
  if (unsubscribeGame) unsubscribeGame();
  if (hostHeartbeatId) clearInterval(hostHeartbeatId);
});
