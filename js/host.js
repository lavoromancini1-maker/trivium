// host.js
import { renderBoard } from "./ui-host.js";
import { createGame, listenGame } from "./firebase-game.js";

let currentGameCode = null;
let unsubscribeGame = null;

document.addEventListener("DOMContentLoaded", () => {
  const boardContainer = document.getElementById("board-container");
  const createGameBtn = document.getElementById("create-game-btn");
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playersListEl = document.getElementById("players-list");
  const messageTextEl = document.getElementById("message-text");

  if (!boardContainer) {
    console.error("Elemento #board-container non trovato in host.html");
    return;
  }

  // Disegna tabellone in modalità debug (già fatto in precedenza)
  renderBoard(boardContainer);

  createGameBtn.addEventListener("click", async () => {
    try {
      createGameBtn.disabled = true;
      createGameBtn.textContent = "Creazione in corso...";

      const { gameCode } = await createGame();
      currentGameCode = gameCode;

      gameCodeDisplay.textContent = `CODICE PARTITA: ${gameCode}`;
      messageTextEl.textContent = "Condividi il codice con i giocatori.";

      // Ascolta lo stato della partita
      if (unsubscribeGame) unsubscribeGame();
      unsubscribeGame = listenGame(gameCode, (gameState) => {
        if (!gameState) {
          messageTextEl.textContent = "Partita non trovata.";
          return;
        }
        renderPlayers(gameState.players || {}, playersListEl);
      });

      createGameBtn.textContent = "Partita creata";
    } catch (err) {
      console.error(err);
      alert("Errore nella creazione della partita.");
      createGameBtn.disabled = false;
      createGameBtn.textContent = "Crea nuova partita";
    }
  });
});

function renderPlayers(playersObj, container) {
  container.innerHTML = "";
  const entries = Object.entries(playersObj);

  if (entries.length === 0) {
    container.textContent = "Nessun giocatore connesso.";
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "players-list";

  for (const [playerId, player] of entries) {
    const li = document.createElement("li");
    li.className = "players-list-item";
    li.textContent = player.name || `Giocatore senza nome (${playerId})`;
    ul.appendChild(li);
  }

  container.appendChild(ul);
}
