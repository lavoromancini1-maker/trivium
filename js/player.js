// player.js
import { joinGame, gameExists, listenGame, rollDice, chooseDirection } from "./firebase-game.js";

let currentGameCode = null;
let currentPlayerId = null;
let unsubscribeGame = null;

document.addEventListener("DOMContentLoaded", () => {
  const gameCodeInput = document.getElementById("game-code-input");
  const playerNameInput = document.getElementById("player-name-input");
  const joinForm = document.getElementById("join-game-form");
  const joinErrorEl = document.getElementById("join-error");
  const joinPanel = document.getElementById("join-game-panel");
  const waitingPanel = document.getElementById("waiting-panel");
  const playerNameDisplay = document.getElementById("player-name-display");

  const turnPanel = document.getElementById("turn-panel");
  const turnStatusText = document.getElementById("turn-status-text");
  const rollDiceBtn = document.getElementById("roll-dice-btn");
  const diceResultEl = document.getElementById("dice-result");
  const directionPanel = document.getElementById("direction-panel");
  const directionButtons = document.getElementById("direction-buttons");

  // precompila codice se c'è ?game=XXXX
  const params = new URLSearchParams(window.location.search);
  const gameFromUrl = params.get("game");
  if (gameFromUrl) {
    gameCodeInput.value = gameFromUrl;
  }

  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    joinErrorEl.textContent = "";

    const gameCode = gameCodeInput.value.trim();
    const playerName = playerNameInput.value.trim();

    if (!gameCode || !playerName) {
      joinErrorEl.textContent = "Inserisci codice partita e nome.";
      return;
    }

    try {
      const exists = await gameExists(gameCode);
      if (!exists) {
        joinErrorEl.textContent = "Partita non trovata. Controlla il codice.";
        return;
      }

      const { playerId } = await joinGame(gameCode, playerName);

      currentGameCode = gameCode;
      currentPlayerId = playerId;

      window.currentPlayerId = playerId;

      playerNameDisplay.textContent = `Giocatore: ${playerName}`;

      joinPanel.classList.add("hidden");
      waitingPanel.classList.remove("hidden");

      // Iniziamo ad ascoltare lo stato della partita
      if (unsubscribeGame) unsubscribeGame();
      unsubscribeGame = listenGame(gameCode, (gameState) => {
        handleGameUpdate(gameState, {
          waitingPanel,
          turnPanel,
          turnStatusText,
          rollDiceBtn,
          diceResultEl,
          directionPanel,
          directionButtons,
        });
      });
    } catch (err) {
      console.error(err);
      joinErrorEl.textContent = "Errore durante l'ingresso in partita.";
    }
  });

  // Tiro del dado
  rollDiceBtn.addEventListener("click", async () => {
    if (!currentGameCode || !currentPlayerId) return;
    try {
      rollDiceBtn.disabled = true;
      turnStatusText.textContent = "Tiro il dado...";
      const { diceResult } = await rollDice(currentGameCode, currentPlayerId);
      diceResultEl.textContent = `Hai tirato: ${diceResult}`;
      // Il passaggio a CHOOSE_DIRECTION sarà gestito dal listener
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nel tiro del dado.");
      rollDiceBtn.disabled = false;
    }
  });

  // Scegli direzione: i pulsanti sono creati dinamicamente
  directionButtons.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-dir-index]");
    if (!btn) return;
    const dirIndex = parseInt(btn.getAttribute("data-dir-index"), 10);
    if (Number.isNaN(dirIndex)) return;

    if (!currentGameCode || !currentPlayerId) return;

    try {
      // disattiva i pulsanti per evitare doppi click
      Array.from(directionButtons.querySelectorAll("button")).forEach((b) => (b.disabled = true));
      turnStatusText.textContent = "Spostamento in corso...";
      await chooseDirection(currentGameCode, currentPlayerId, dirIndex);
      // il listener aggiornerà lo stato e nasconderà il pannello
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nella scelta della direzione.");
    }
  });
});

/**
 * Gestisce l'aggiornamento dello stato della partita lato giocatore.
 */
function handleGameUpdate(
  gameState,
  {
    waitingPanel,
    turnPanel,
    turnStatusText,
    rollDiceBtn,
    diceResultEl,
    directionPanel,
    directionButtons,
  }
) {
  if (!gameState) {
    turnStatusText.textContent = "Partita non trovata.";
    return;
  }

  const state = gameState.state || "LOBBY";

  if (state === "LOBBY") {
    waitingPanel.classList.remove("hidden");
    turnPanel.classList.add("hidden");
    return;
  }

  if (state === "IN_PROGRESS") {
    const currentPlayerId = gameState.currentPlayerId;
    const players = gameState.players || {};
    const me = players[currentPlayerId];

    // Siamo in partita: nasconde pannello attesa
    waitingPanel.classList.add("hidden");
    turnPanel.classList.remove("hidden");

    if (!players[currentPlayerId]) {
      // Non sappiamo chi è il current, ma la partita è in corso
      turnStatusText.textContent = "Partita in corso.";
      rollDiceBtn.disabled = true;
      directionPanel.classList.add("hidden");
      return;
    }

    // È il mio turno?
    const isMyTurn = currentPlayerId === window.currentPlayerId || currentPlayerId === window.currentPlayerId;

    // ⚠️ meglio usare la variabile globale definita sopra:
    // ma qui abbiamo currentPlayerId come parametro di funzione, la mia id è quella globale
    const myId = window.currentPlayerId || null;

    let reallyMyTurn = false;
    if (myId && currentPlayerId === myId) {
      reallyMyTurn = true;
    }

    const phase = gameState.phase;

    if (reallyMyTurn) {
      if (phase === "WAIT_ROLL") {
        turnStatusText.textContent = "È il tuo turno. Tira il dado.";
        rollDiceBtn.disabled = false;
        directionPanel.classList.add("hidden");
        diceResultEl.textContent = "";
      } else if (phase === "CHOOSE_DIRECTION") {
        const dice = gameState.currentDice;
        turnStatusText.textContent = `Hai tirato ${dice}. Scegli la direzione.`;
        rollDiceBtn.disabled = true;

        // mostra le direzioni disponibili
        const dirs = gameState.availableDirections || [];
        directionPanel.classList.remove("hidden");
        directionButtons.innerHTML = "";
        dirs.forEach((d) => {
          const btn = document.createElement("button");
          btn.className = "btn btn-secondary dir-btn";
          btn.setAttribute("data-dir-index", d.index);
          const catLabel = d.category ? ` – ${d.category}` : "";
          btn.textContent = `${d.label}${catLabel}`;
          directionButtons.appendChild(btn);
        });
      } else if (phase === "RESOLVE_TILE") {
        rollDiceBtn.disabled = true;
        directionPanel.classList.add("hidden");
        const ct = gameState.currentTile;
        if (ct) {
          turnStatusText.textContent = `Sei arrivato su una casella: ${ct.type}${
            ct.category ? " (" + ct.category + ")" : ""
          }.`;
        } else {
          turnStatusText.textContent = "Movimento completato.";
        }
      } else {
        // altre fasi future
        turnStatusText.textContent = "Attendi le prossime azioni...";
        rollDiceBtn.disabled = true;
        directionPanel.classList.add("hidden");
      }
    } else {
      // Non è il mio turno
      directionPanel.classList.add("hidden");
      rollDiceBtn.disabled = true;

      const currentPlayer = players[currentPlayerId];
      if (currentPlayer) {
        const phase = gameState.phase;
        if (phase === "WAIT_ROLL") {
          turnStatusText.textContent = `È il turno di ${currentPlayer.name}. Sta per tirare il dado.`;
        } else if (phase === "CHOOSE_DIRECTION") {
          turnStatusText.textContent = `È il turno di ${currentPlayer.name}. Sta scegliendo la direzione.`;
        } else if (phase === "RESOLVE_TILE") {
          turnStatusText.textContent = `È il turno di ${currentPlayer.name}. Si risolve la casella.`;
        } else {
          turnStatusText.textContent = `È il turno di ${currentPlayer.name}.`;
        }
      } else {
        turnStatusText.textContent = "Partita in corso.";
      }
    }

    return;
  }

  // altri stati (es. GAME_OVER)
}
