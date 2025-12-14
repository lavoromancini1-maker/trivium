import {
  joinGame,
  gameExists,
  listenGame,
  rollDice,
  chooseDirection,
  answerCategoryQuestion,
  answerRapidFireQuestion,
  chooseRiskDecision,
  chooseDuelOpponent,
  answerEventQuestion,
} from "./firebase-game.js";



let currentGameCode = null;
let currentPlayerId = null;
let unsubscribeGame = null;
let latestGameState = null;
let lastRapidFireIndex = null;


document.addEventListener("DOMContentLoaded", () => {
  const gameCodeInput = document.getElementById("game-code-input");
  const playerNameInput = document.getElementById("player-name-input");
  const joinForm = document.getElementById("join-game-form");
  const joinErrorEl = document.getElementById("join-error");
  const joinPanel = document.getElementById("join-game-panel");
  const waitingPanel = document.getElementById("waiting-panel");
  const playerNameDisplay = document.getElementById("player-name-display");
  const playerProgressEl = document.getElementById("player-progress");

  const turnPanel = document.getElementById("turn-panel");
  const turnStatusText = document.getElementById("turn-status-text");
  const rollDiceBtn = document.getElementById("roll-dice-btn");
  const diceResultEl = document.getElementById("dice-result");
  const directionPanel = document.getElementById("direction-panel");
  const directionButtons = document.getElementById("direction-buttons");

  const answerPanel = document.getElementById("answer-panel");
  const answerButtons = document.getElementById("answer-buttons");

  // precompila codice se c'è ?game=XXXX
  const params = new URLSearchParams(window.location.search);
  const gameFromUrl = params.get("game");
  if (gameFromUrl) {
    gameCodeInput.value = gameFromUrl;
  }

  // JOIN PARTITA
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
        latestGameState = gameState;
        
        handleGameUpdate(gameState, {
          waitingPanel,
          turnPanel,
          turnStatusText,
          rollDiceBtn,
          diceResultEl,
          directionPanel,
          directionButtons,
          answerPanel,
          answerButtons,
          playerProgressEl,
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

directionButtons.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (!currentGameCode || !currentPlayerId) return;

  try {
    // disattiva tutti i pulsanti per evitare doppi click
    Array.from(directionButtons.querySelectorAll("button")).forEach(
      (b) => (b.disabled = true)
    );

    // 1) EVENTO: scelta avversario (DUELLO)
    const opponentId = btn.dataset.opponentId;
    if (opponentId) {
      turnStatusText.textContent = "Scelta sfidante in corso...";
      await chooseDuelOpponent(currentGameCode, currentPlayerId, opponentId);
      return;
    }

    // 2) EVENTO: scelta sì/no (RISK)
    const riskChoice = btn.dataset.riskChoice;
    if (riskChoice) {
      turnStatusText.textContent = "Scelta in corso...";
      await chooseRiskDecision(currentGameCode, currentPlayerId, riskChoice);
      return;
    }

    // 3) NORMALE: scelta direzione
    const dirIndex = parseInt(btn.getAttribute("data-dir-index"), 10);
    if (Number.isNaN(dirIndex)) return;

    turnStatusText.textContent = "Spostamento in corso...";
    await chooseDirection(currentGameCode, currentPlayerId, dirIndex);
  } catch (err) {
    console.error(err);
    alert(err.message || "Errore nella selezione.");
  }
});


  // Risposta A/B/C/D
  answerButtons.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-answer-index]");
    if (!btn) return;

    const answerIndex = parseInt(btn.getAttribute("data-answer-index"), 10);
    if (Number.isNaN(answerIndex)) return;

    if (!currentGameCode || !currentPlayerId) return;

    try {
      // disattivo i pulsanti per evitare doppi tap
      Array.from(answerButtons.querySelectorAll("button")).forEach(
        (b) => (b.disabled = true)
      );
if (latestGameState && latestGameState.phase === "RAPID_FIRE") {
  await answerRapidFireQuestion(currentGameCode, currentPlayerId, answerIndex);
} else if (latestGameState && latestGameState.phase && latestGameState.phase.startsWith("EVENT")) {
  await answerEventQuestion(currentGameCode, currentPlayerId, answerIndex);
} else {
  await answerCategoryQuestion(currentGameCode, currentPlayerId, answerIndex);
}


      // Il listener di stato si occuperà di aggiornare pannelli, overlay, ecc.
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nell'invio della risposta.");
      Array.from(answerButtons.querySelectorAll("button")).forEach(
        (b) => (b.disabled = false)
      );
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
    answerPanel,
    answerButtons,
    playerProgressEl
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
    answerPanel.classList.add("hidden");
    return;
  }

  if (state === "IN_PROGRESS") {
    const activePlayerId = gameState.currentPlayerId;
    const players = gameState.players || {};
    const currentQuestion = gameState.currentQuestion || null;
    const phase = gameState.phase;

    const myId = currentPlayerId;
    const isMyTurn = myId && activePlayerId === myId;

    renderPlayerProgress(gameState, myId, playerProgressEl);

    waitingPanel.classList.add("hidden");
    turnPanel.classList.remove("hidden");

if (phase === "RAPID_FIRE") {
  rollDiceBtn.disabled = true;
  directionPanel.classList.add("hidden");

  const rapidFire = gameState.rapidFire || null;
  const idx = rapidFire ? (rapidFire.currentIndex ?? 0) : 0;

  // Reset UI quando cambia domanda (indice diverso)
  if (lastRapidFireIndex !== idx) {
    lastRapidFireIndex = idx;

    // riabilita bottoni (poi li disabilitiamo se alreadyAnswered)
    Array.from(answerButtons.querySelectorAll("button")).forEach((b) => {
      b.disabled = false;
    });
  }

  const alreadyAnswered =
    rapidFire &&
    rapidFire.answeredThisQuestion &&
    rapidFire.answeredThisQuestion[myId];

  turnStatusText.textContent = alreadyAnswered
    ? "Rapid Fire: hai già risposto. Attendi la prossima domanda..."
    : "MINIGIOCO: Rapid Fire! Rispondi più domande possibili.";

  answerPanel.classList.remove("hidden");

  Array.from(answerButtons.querySelectorAll("button")).forEach((b) => {
    b.disabled = !!alreadyAnswered;
  });

  return;
}

    // ✅ Fase REVEAL: mostra esito al giocatore che ha risposto
if (phase === "REVEAL") {
  rollDiceBtn.disabled = true;
  directionPanel.classList.add("hidden");
  answerPanel.classList.add("hidden");

  const r = gameState.reveal;
  if (r && r.forPlayerId === myId) {
    turnStatusText.textContent = r.correct
      ? "✅ Risposta corretta!"
      : "❌ Risposta sbagliata!";
  } else {
    turnStatusText.textContent = "Attendi...";
  }

  // (opzionale) riabilita i pulsanti A/B/C/D quando si torna in QUESTION/RAPID_FIRE
  Array.from(answerButtons.querySelectorAll("button")).forEach((b) => (b.disabled = true));
  return;
}

// ───────────────────────────────
// EVENTI (STEP 3) - UI PLAYER
// ───────────────────────────────

if (phase === "EVENT_RISK_DECISION") {
  rollDiceBtn.disabled = true;
  answerPanel.classList.add("hidden");

  const ev = gameState.currentEvent;
  const isOwner = ev && ev.ownerPlayerId === myId;

  directionPanel.classList.remove("hidden");
  directionButtons.innerHTML = "";

  if (isOwner) {
    turnStatusText.textContent = "EVENTO: Rischia o Vinci. Vuoi partecipare?";
    const yesBtn = document.createElement("button");
    yesBtn.className = "btn btn-secondary dir-btn";
    yesBtn.textContent = "SÌ";
    yesBtn.dataset.riskChoice = "YES";

    const noBtn = document.createElement("button");
    noBtn.className = "btn btn-secondary dir-btn";
    noBtn.textContent = "NO";
    noBtn.dataset.riskChoice = "NO";

    directionButtons.appendChild(yesBtn);
    directionButtons.appendChild(noBtn);
  } else {
    turnStatusText.textContent = "Evento in corso... attendi.";
  }

  return;
}

if (phase === "EVENT_DUEL_CHOOSE") {
  rollDiceBtn.disabled = true;
  answerPanel.classList.add("hidden");

  const ev = gameState.currentEvent;
  const isOwner = ev && ev.ownerPlayerId === myId;

  directionPanel.classList.remove("hidden");
  directionButtons.innerHTML = "";

  if (isOwner) {
    turnStatusText.textContent = "EVENTO: Duello. Scegli uno sfidante.";
    Object.entries(players).forEach(([pid, p]) => {
      if (pid === myId) return;
      const b = document.createElement("button");
      b.className = "btn btn-secondary dir-btn";
      b.textContent = p.name || "Giocatore";
      b.dataset.opponentId = pid;
      directionButtons.appendChild(b);
    });
  } else {
    turnStatusText.textContent = "Evento Duello: l'avversario sta scegliendo lo sfidante...";
  }

  return;
}

if (phase === "EVENT_QUESTION") {
  rollDiceBtn.disabled = true;
  directionPanel.classList.add("hidden");

  const ev = gameState.currentEvent;
  const isOwner = ev && ev.ownerPlayerId === myId;

  if (isOwner && currentQuestion) {
    turnStatusText.textContent = "EVENTO: rispondi (A/B/C/D).";
    answerPanel.classList.remove("hidden");
    Array.from(answerButtons.querySelectorAll("button")).forEach((b) => (b.disabled = false));
  } else {
    turnStatusText.textContent = "Evento in corso... attendi.";
    answerPanel.classList.add("hidden");
  }

  return;
}

if (phase === "EVENT_DUEL_QUESTION") {
  rollDiceBtn.disabled = true;
  directionPanel.classList.add("hidden");

  const ev = gameState.currentEvent;
  const isParticipant =
    ev && (ev.ownerPlayerId === myId || ev.opponentPlayerId === myId);

  if (isParticipant && currentQuestion) {
    turnStatusText.textContent = "DUELLO: rispondi (A/B/C/D).";
    answerPanel.classList.remove("hidden");
    Array.from(answerButtons.querySelectorAll("button")).forEach((b) => (b.disabled = false));
  } else {
    turnStatusText.textContent = "DUELLO in corso... attendi.";
    answerPanel.classList.add("hidden");
  }

  return;
}
    
    if (isMyTurn) {
      if (phase === "WAIT_ROLL") {
        turnStatusText.textContent = "È il tuo turno. Tira il dado.";
        rollDiceBtn.disabled = false;
        directionPanel.classList.add("hidden");
        diceResultEl.textContent = "";
        answerPanel.classList.add("hidden");
        Array.from(answerButtons.querySelectorAll("button")).forEach((b) => (b.disabled = false));
        lastRapidFireIndex = null;
      } else if (phase === "CHOOSE_DIRECTION") {
        const dice = gameState.currentDice;
        turnStatusText.textContent = `Hai tirato ${dice}. Scegli la direzione.`;
        rollDiceBtn.disabled = true;

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

        lastRapidFireIndex = null;
        
        answerPanel.classList.add("hidden");
      } else if (phase === "QUESTION") {
        rollDiceBtn.disabled = true;
        directionPanel.classList.add("hidden");
        if (currentQuestion && currentQuestion.forPlayerId === myId) {
          turnStatusText.textContent =
            "È la tua domanda. Scegli A, B, C o D.";
          answerPanel.classList.remove("hidden");
          Array.from(answerButtons.querySelectorAll("button")).forEach(
            (b) => (b.disabled = false)
          );
        } else {
          turnStatusText.textContent = "Attendi la domanda...";
          answerPanel.classList.add("hidden");
        }
      } else {
        turnStatusText.textContent = "Attendi le prossime azioni...";
        rollDiceBtn.disabled = true;
        directionPanel.classList.add("hidden");
        answerPanel.classList.add("hidden");
      }
    } else {
      // Non è il mio turno
      rollDiceBtn.disabled = true;
      directionPanel.classList.add("hidden");
      answerPanel.classList.add("hidden");

      const activePlayer = players[activePlayerId];
      if (activePlayer) {
        if (phase === "WAIT_ROLL") {
          turnStatusText.textContent = `È il turno di ${activePlayer.name}. Sta per tirare il dado.`;
        } else if (phase === "CHOOSE_DIRECTION") {
          turnStatusText.textContent = `È il turno di ${activePlayer.name}. Sta scegliendo la direzione.`;
        } else if (phase === "QUESTION") {
          turnStatusText.textContent = `È il turno di ${activePlayer.name}. Sta rispondendo alla domanda.`;
        } else {
          turnStatusText.textContent = `È il turno di ${activePlayer.name}.`;
        }
      } else {
        turnStatusText.textContent = "Partita in corso.";
      }
    }

    return;
  }

  // altri stati futuri
}

const CATEGORIES = ["geografia", "storia", "arte", "sport", "spettacolo", "scienza"];

function renderPlayerProgress(gameState, myId, container) {
  if (!container) return;

  const players = gameState?.players || {};
  const me = players[myId];
  if (!me) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");

  const levels = me.levels || {};
  const keys = me.keys || {};

  // evidenzia la categoria della domanda se sto rispondendo io
  let activeCategory = null;
  if (
    gameState?.phase === "QUESTION" &&
    gameState.currentQuestion &&
    gameState.currentQuestion.forPlayerId === myId
  ) {
    activeCategory = gameState.currentQuestion.category;
  }

  const rowsHtml = CATEGORIES.map((cat) => {
    const lvl = Math.max(0, Math.min(3, Number(levels[cat] ?? 0)));
    const hasKey = !!keys[cat];
    const isActive = activeCategory === cat;

    return `
      <div class="pp-row ${isActive ? "pp-row--active" : ""}">
        <div class="pp-left">
          <span class="pp-cat pp-cat--${cat}">${cat}</span>
          <span class="key-dot key-dot--${cat} ${hasKey ? "key-dot--on" : ""}"></span>
        </div>

        <div class="pp-right">
          <div class="lvl-bar lvl-bar--${cat} ${hasKey ? "lvl-bar--key" : ""}">
            <span class="lvl-fill lvl-fill--${lvl}"></span>
          </div>
          <span class="pp-lvl">Liv. ${lvl}</span>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="pp-title">Progressi categorie</div>
    <div class="pp-grid">
      ${rowsHtml}
    </div>
  `;
}
