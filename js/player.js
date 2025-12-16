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
  answerClosestMinigame,
  answerVFFlashMinigame,
  answerIntruderMinigame,
  answerSequenceMinigame,
} from "./firebase-game.js";



let currentGameCode = null;
let currentPlayerId = null;
let unsubscribeGame = null;
let latestGameState = null;
let lastRapidFireIndex = null;
let closestPanel = null;
let closestInput = null;
let closestSendBtn = null;
let closestHint = null;
let vfPanel = null;
let vfText = null;
let vfTrueBtn = null;
let vfFalseBtn = null;
let vfHint = null;
let intruderPanel, intruderPrompt, intrA, intrB, intrC, intrD, intruderHint;
let sequencePanel, sequencePrompt, sequenceItems, sequenceResetBtn, sequenceSubmitBtn, sequenceHint;
let sequenceSelection = []; // array di indici scelti
let lastSequenceQuestionId = null;

async function sendVF(choice) {
  if (!currentGameCode || !currentPlayerId) return;
  if (!vfHint || !vfTrueBtn || !vfFalseBtn) return;

  vfHint.textContent = "";

  try {
    vfTrueBtn.disabled = true;
    vfFalseBtn.disabled = true;

    await answerVFFlashMinigame(currentGameCode, currentPlayerId, choice);

    // feedback neutro (evita errori di sync)
    vfHint.textContent = "✅ Risposta inviata!";
  } catch (e) {
    vfHint.textContent = e.message || "Errore invio.";
    vfTrueBtn.disabled = false;
    vfFalseBtn.disabled = false;
  }
}

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

closestPanel = document.getElementById("closest-panel");
closestInput = document.getElementById("closest-input");
closestSendBtn = document.getElementById("closest-send-btn");
closestHint = document.getElementById("closest-hint");

vfPanel = document.getElementById("vf-panel");
vfText = document.getElementById("vf-text");
vfTrueBtn = document.getElementById("vf-true-btn");
vfFalseBtn = document.getElementById("vf-false-btn");
vfHint = document.getElementById("vf-hint"); 

vfTrueBtn?.addEventListener("click", () => sendVF(true));
vfFalseBtn?.addEventListener("click", () => sendVF(false));

intruderPanel = document.getElementById("intruder-panel");
intruderPrompt = document.getElementById("intruder-prompt");
intrA = document.getElementById("intr-a");
intrB = document.getElementById("intr-b");
intrC = document.getElementById("intr-c");
intrD = document.getElementById("intr-d");
intruderHint = document.getElementById("intruder-hint"); 

sequencePanel = document.getElementById("sequence-panel");
sequencePrompt = document.getElementById("sequence-prompt");
sequenceItems = document.getElementById("sequence-items");
sequenceResetBtn = document.getElementById("sequence-reset-btn");
sequenceSubmitBtn = document.getElementById("sequence-submit-btn");
sequenceHint = document.getElementById("sequence-hint");  

closestSendBtn?.addEventListener("click", async () => {
  if (!currentGameCode || !currentPlayerId) return;
  closestHint.textContent = "";

  try {
    closestSendBtn.disabled = true;
    await answerClosestMinigame(currentGameCode, currentPlayerId, closestInput.value);
    closestHint.textContent = "✅ Inviato!";
  } catch (e) {
    closestHint.textContent = e.message || "Errore invio.";
    closestSendBtn.disabled = false;
  }
});

async function sendIntruder(idx) {
  if (!currentGameCode || !currentPlayerId) return;
  if (!intruderHint) return;

  intruderHint.textContent = "";
  try {
    [intrA, intrB, intrC, intrD].forEach(b => b && (b.disabled = true));
    await answerIntruderMinigame(currentGameCode, currentPlayerId, idx);
    intruderHint.textContent = "✅ Risposta inviata!";
  } catch (e) {
    intruderHint.textContent = e.message || "Errore invio.";
    [intrA, intrB, intrC, intrD].forEach(b => b && (b.disabled = false));
  }
}

function renderSequencePicker(items) {
  if (!sequenceItems) return;
  sequenceItems.innerHTML = "";

  items.forEach((text, idx) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.margin = "6px 0";

    const pickedPos = sequenceSelection.indexOf(idx);
    btn.textContent = pickedPos >= 0 ? `${pickedPos + 1}. ${text}` : text;

    btn.disabled = pickedPos >= 0; // una volta scelto, non puoi riselezionarlo finché non resetti

    btn.addEventListener("click", () => {
      sequenceSelection.push(idx);
      renderSequencePicker(items);
    });

    sequenceItems.appendChild(btn);
  });
}

sequenceResetBtn?.addEventListener("click", () => {
  sequenceSelection = [];
  if (latestGameState?.minigame?.type === "SEQUENCE") {
    renderSequencePicker(latestGameState.minigame.items || []);
  }
  if (sequenceHint) sequenceHint.textContent = "";
});

sequenceSubmitBtn?.addEventListener("click", async () => {
  if (!currentGameCode || !currentPlayerId) return;
  if (!latestGameState?.minigame || latestGameState.minigame.type !== "SEQUENCE") return;

  const items = latestGameState.minigame.items || [];
  if (sequenceSelection.length !== items.length) {
    if (sequenceHint) sequenceHint.textContent = "Devi selezionare tutti gli elementi in ordine.";
    return;
  }

  try {
    sequenceSubmitBtn.disabled = true;
    await answerSequenceMinigame(currentGameCode, currentPlayerId, sequenceSelection);
    if (sequenceHint) sequenceHint.textContent = "✅ Ordine inviato!";
  } catch (e) {
    if (sequenceHint) sequenceHint.textContent = e.message || "Errore invio.";
    sequenceSubmitBtn.disabled = false;
  }
});  

intrA?.addEventListener("click", () => sendIntruder(0));
intrB?.addEventListener("click", () => sendIntruder(1));
intrC?.addEventListener("click", () => sendIntruder(2));
intrD?.addEventListener("click", () => sendIntruder(3));
  
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

// --- RESET UI minigame "Closest" se non siamo in MINIGAME/CLOSEST ---
const mg = gameState.minigame;
const isClosestActive = phase === "MINIGAME" && mg && mg.type === "CLOSEST";
if (!isClosestActive && closestPanel && closestHint && closestSendBtn) {
  closestPanel.classList.add("hidden");
  closestHint.textContent = "";
  closestSendBtn.disabled = false;
}

const isIntruderActive = phase === "MINIGAME" && mg && mg.type === "INTRUDER";
if (!isIntruderActive && intruderPanel && intruderHint) {
  intruderPanel.classList.add("hidden");
  intruderHint.textContent = "";
  [intrA, intrB, intrC, intrD].forEach(b => b && (b.disabled = false));
}    

const isSequenceActive = phase === "MINIGAME" && mg && mg.type === "SEQUENCE";
if (!isSequenceActive && sequencePanel && sequenceHint && sequenceSubmitBtn) {
  sequencePanel.classList.add("hidden");
  sequenceHint.textContent = "";
  sequenceSubmitBtn.disabled = false;
  sequenceSelection = [];
}
    
// --- RESET UI minigame "VF Flash" se non siamo in MINIGAME/VF_FLASH ---
const isVFActive = phase === "MINIGAME" && mg && mg.type === "VF_FLASH";
if (!isVFActive && vfPanel && vfHint && vfTrueBtn && vfFalseBtn) {
  vfPanel.classList.add("hidden");
  vfHint.textContent = "";
  vfTrueBtn.disabled = false;
  vfFalseBtn.disabled = false;
}

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

if (phase === "MINIGAME") {
  rollDiceBtn.disabled = true;
  directionPanel.classList.add("hidden");
  answerPanel.classList.add("hidden");

  const mg = gameState.minigame;

if (mg && mg.type === "VF_FLASH") {
  turnStatusText.textContent = "MINIGIOCO: Vero/Falso lampo!";
if (closestPanel) closestPanel.classList.add("hidden");
if (intruderPanel) intruderPanel.classList.add("hidden");
answerPanel.classList.add("hidden");

  vfPanel.classList.remove("hidden");

  const idx = mg.index ?? 0;
  const stmt = mg.statements?.[idx];
  vfText.textContent = stmt?.text || "";

  const already = mg.answeredThis && mg.answeredThis[myId];
  vfTrueBtn.disabled = !!already;
  vfFalseBtn.disabled = !!already;
  vfHint.textContent = already ? "Hai già risposto a questa affermazione." : "";

  return;
}

if (mg && mg.type === "SEQUENCE") {
  turnStatusText.textContent = "MINIGIOCO: Ordina la sequenza!";
  if (closestPanel) closestPanel.classList.add("hidden");
  if (vfPanel) vfPanel.classList.add("hidden");
  if (intruderPanel) intruderPanel.classList.add("hidden");
  answerPanel.classList.add("hidden");

  if (sequencePanel) sequencePanel.classList.remove("hidden");
  if (sequencePrompt) sequencePrompt.textContent = mg.prompt || "";

  if (mg.questionId && mg.questionId !== lastSequenceQuestionId) {
  lastSequenceQuestionId = mg.questionId;
  sequenceSelection = [];
}

  const already = mg.locked && mg.locked[myId];
  if (already) {
    if (sequenceHint) sequenceHint.textContent = "Hai già confermato l’ordine.";
    if (sequenceSubmitBtn) sequenceSubmitBtn.disabled = true;
  } else {
    if (sequenceHint) sequenceHint.textContent = "";
    if (sequenceSubmitBtn) sequenceSubmitBtn.disabled = false;
    // se nuova domanda/nuovo start, reset locale
    if (!Array.isArray(sequenceSelection) || sequenceSelection.length > (mg.items?.length || 0)) {
      sequenceSelection = [];
    }
    renderSequencePicker(mg.items || []);
  }

  return;
}  

 if (mg && mg.type === "INTRUDER") {
  turnStatusText.textContent = "MINIGIOCO: L’intruso!";
  if (closestPanel) closestPanel.classList.add("hidden");
  if (vfPanel) vfPanel.classList.add("hidden");
  if (answerPanel) answerPanel.classList.add("hidden");

  if (intruderPanel) intruderPanel.classList.remove("hidden");
  if (intruderPrompt) intruderPrompt.textContent = mg.prompt || "Qual è l’intruso?";

  const already = mg.answeredThis && mg.answeredThis[myId];
  [intrA, intrB, intrC, intrD].forEach(b => b && (b.disabled = !!already));
  if (intruderHint) intruderHint.textContent = already ? "Hai già risposto." : "";

  return;
} 

  if (mg && mg.type === "CLOSEST") {
    turnStatusText.textContent = "MINIGIOCO: Più vicino vince. Inserisci un numero!";
    closestPanel.classList.remove("hidden");

    const already = mg.locked && mg.locked[myId];
    closestSendBtn.disabled = !!already;
    if (already) closestHint.textContent = "Hai già inviato.";
  } else {
    closestPanel.classList.add("hidden");
    turnStatusText.textContent = "Minigioco in corso... attendi.";
    if (vfPanel) vfPanel.classList.add("hidden");
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

        // layout speciale se sono “molte uscite” (tipico dello scrigno)
        const isManyExits = dirs.length >= 4;
        directionButtons.classList.toggle("dir-grid-2", isManyExits);
        directionButtons.classList.toggle("dir-grid-1", !isManyExits);

        const emojiByCat = {
          geografia: "🌍",
          storia: "🏛️",
          arte: "🎨",
          sport: "🏅",
          spettacolo: "🎬",
          scienza: "🧪",
        };

        const prettyType = (t) => {
          if (!t) return "";
          if (t === "key") return "CHIAVE";
          if (t === "event") return "EVENTO";
          if (t === "minigame") return "MINIGAME";
          if (t === "scrigno") return "SCRIGNO";
          if (t === "category") return "CATEGORIA";
          return t.toUpperCase();
        };

        dirs.forEach((d) => {
          const btn = document.createElement("button");
          btn.className = "dir-card";
          btn.setAttribute("data-dir-index", d.index);

          // ✅ usiamo la preview finale se presente, altrimenti fallback a d.category
          const cat = d.previewCategory || d.category || null;
          const icon = cat ? (emojiByCat[cat] || "❓") : "➡️";

          const title = d.label || "Direzione";
          const line1 = cat ? `${icon} ${cat.toUpperCase()}` : `${icon} —`;
          const line2 = `Arrivi su: ${prettyType(d.previewType || d.type)} #${d.previewTileId ?? "?"}`;

          btn.innerHTML = `
            <div class="dir-card-title">${title}</div>
            <div class="dir-card-main">${line1}</div>
            <div class="dir-card-sub">${line2}</div>
          `;

          directionButtons.appendChild(btn);
        });

        lastRapidFireIndex = null;
        answerPanel.classList.add("hidden");

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
