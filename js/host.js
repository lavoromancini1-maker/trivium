import { renderBoard } from "./ui-host.js";

document.addEventListener("DOMContentLoaded", () => {
  const boardContainer = document.getElementById("board-container");

  if (!boardContainer) {
    console.error("Elemento #board-container non trovato in host.html");
    return;
  }

  renderBoard(boardContainer);

});

