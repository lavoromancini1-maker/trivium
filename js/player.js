import { joinGame, gameExists } from "./firebase-game.js";

let currentGameCode = null;
let currentPlayerId = null;

document.addEventListener("DOMContentLoaded", () => {
  const gameCodeInput = document.getElementById("game-code-input");
  const playerNameInput = document.getElementById("player-name-input");
  const joinForm = document.getElementById("join-game-form");
  const joinErrorEl = document.getElementById("join-error");
  const joinPanel = document.getElementById("join-game-panel");
  const waitingPanel = document.getElementById("waiting-panel");
  const playerNameDisplay = document.getElementById("player-name-display");

  // Se l'URL contiene ?game=XXXXXX, precompiliamo il codice
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
      // Verifica che la partita esista
      const exists = await gameExists(gameCode);
      if (!exists) {
        joinErrorEl.textContent = "Partita non trovata. Controlla il codice.";
        return;
      }

      const { playerId } = await joinGame(gameCode, playerName);

      currentGameCode = gameCode;
      currentPlayerId = playerId;

      // Mostra nome in alto
      playerNameDisplay.textContent = `Giocatore: ${playerName}`;

      // Nascondi form, mostra pannello attesa
      joinPanel.classList.add("hidden");
      waitingPanel.classList.remove("hidden");

      // Più avanti qui ascolteremo lo stato di gioco e mostreremo
      // tiro di dado, risposte ecc.
    } catch (err) {
      console.error(err);
      joinErrorEl.textContent = "Errore durante l'ingresso in partita.";
    }
  });
});
