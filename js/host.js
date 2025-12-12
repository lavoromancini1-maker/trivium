import { renderBoard, renderQuestionOverlay } from "./ui-host.js";
import { createGame, listenGame, startGame, checkAndHandleQuestionTimeout } from "./firebase-game.js";

let currentGameCode = null;
let unsubscribeGame = null;
let timeoutIntervalId = null;
let currentGameState = null;

document.addEventListener("DOMContentLoaded", () => {
  const boardContainer = document.getElementById("board-container");
  const createGameBtn = document.getElementById("create-game-btn");
  const startGameBtn = document.getElementById("start-game-btn");
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playersListEl = document.getElementById("players-list");
  const messageTextEl = document.getElementById("message-text");

  if (!boardContainer) {
    console.error("Elemento #board-container non trovato in host.html");
    return;
  }

  // Disegna tabellone in modalità debug (griglia)
  renderBoard(boardContainer);

  createGameBtn.addEventListener("click", async () => {
    try {
      createGameBtn.disabled = true;
      createGameBtn.textContent = "Creazione in corso...";

      const { gameCode } = await createGame();
      currentGameCode = gameCode;

      gameCodeDisplay.textContent = `CODICE PARTITA: ${gameCode}`;
      messageTextEl.textContent = "Condividi il codice con i giocatori.";

      // Permette l'avvio quando i giocatori saranno entrati
      startGameBtn.disabled = false;

      // Ascolta lo stato della partita
      if (unsubscribeGame) unsubscribeGame();
      unsubscribeGame = listenGame(gameCode, (gameState) => {
        if (!gameState) {
          messageTextEl.textContent = "Partita non trovata.";
          return;
        }

        currentGameState = gameState;

        renderPlayers(gameState, playersListEl);
        renderGameMessage(gameState, messageTextEl);
        renderQuestionOverlay(gameState);
      });

      // avvia il controllo periodico dei timeout
      setupTimeoutInterval();



      createGameBtn.textContent = "Partita creata";
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

      // Dopo l'avvio, lasciamo il bottone disabilitato
      startGameBtn.textContent = "Partita avviata";
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nell'avvio della partita.");
      startGameBtn.disabled = false;
      startGameBtn.textContent = "Avvia partita";
    }
  });
});

function renderPlayers(gameState, container) {
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
    // Ordine definito: seguiamo turnOrder
    for (const pid of turnOrder) {
      const player = playersObj[pid];
      if (!player) continue;
      const li = document.createElement("li");
      li.className = "players-list-item";
      if (pid === currentPlayerId) {
        li.classList.add("players-list-item--active");
      }

      const pos = player.position ?? 0;
      
      li.innerHTML = `
        <div class="player-name">${player.name || "Senza nome"}</div>
        <div class="player-info">
          <span>Punti: ${player.points ?? 0}</span><br>
          <span>Casella: ${pos}</span>
        </div>
      `;
      ul.appendChild(li);
    }
  } else {
    // Nessun ordine: siamo ancora in LOBBY, mostriamo i giocatori in ordine di arrivo
    for (const [playerId, player] of playerEntries) {
      const li = document.createElement("li");
      li.className = "players-list-item";
      li.textContent = player.name || `Giocatore (${playerId})`;
      ul.appendChild(li);
    }
  }

  container.appendChild(ul);
}

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

    if (currentPlayer) {
      messageEl.textContent = `Tocca a ${currentPlayer.name}.`;
    } else {
      messageEl.textContent = "Partita in corso.";
    }
    return;
  }

  // Altri stati possibili (es. FINISHED, PAUSED, ecc.)
  messageEl.textContent = "Stato: " + state;
}

// ⬇⬇⬇ DA QUI IN GIÙ siamo fuori da renderGameMessage

function setupTimeoutInterval() {
  // Evita più intervalli sovrapposti
  if (timeoutIntervalId) {
    clearInterval(timeoutIntervalId);
    timeoutIntervalId = null;
  }

  if (!currentGameCode) return;

  timeoutIntervalId = setInterval(async () => {
    try {
      const res = await checkAndHandleQuestionTimeout(currentGameCode);
      if (res && res.handled) {
        console.log("⏰ Timeout domanda gestito automaticamente:", res.reason);
        // Il listener listenGame aggiornerà UI, turni, ecc.
      }
    } catch (err) {
      console.error("Errore nel controllo timeout domanda:", err);
    }
  }, 500);
}

window.addEventListener("beforeunload", () => {
  if (timeoutIntervalId) {
    clearInterval(timeoutIntervalId);
  }
});

});

  messageEl.textContent = "Stato: " + state;
}
