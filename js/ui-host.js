import { BOARD } from "./board.js";
import { CATEGORIES } from "./board.js";

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

  export function renderQuestionOverlay(gameState) {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlay-content");

  if (!overlay || !overlayContent) return;

  if (!gameState || gameState.phase !== "QUESTION" || !gameState.currentQuestion) {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";
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

  overlayContent.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <div class="question-category">${q.category.toUpperCase()} ${
    q.isKeyQuestion ? "– DOMANDA CHIAVE" : ""
  }</div>
        <div class="question-player">Sta rispondendo: <strong>${playerName}</strong></div>
      </div>
      <div class="question-text">${q.text}</div>
      <ul class="answers-list">
        ${answersHtml}
      </ul>
      <div class="question-footer">
        <span>In attesa della risposta sul dispositivo del giocatore...</span>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
}


  container.appendChild(boardEl);
}
