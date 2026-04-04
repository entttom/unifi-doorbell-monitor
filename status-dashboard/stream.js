const STREAM_ENDPOINTS = {
  uiState: "/api/ui_state",
  close: "/api/kill_stream_window",
  actionBase: "/api/actions/",
};

const elements = {
  title: document.getElementById("stream-title"),
  actionsTitle: document.getElementById("stream-actions-title"),
  countdown: document.getElementById("stream-countdown"),
  statusNote: document.getElementById("stream-status-note"),
  closeButton: document.getElementById("stream-close-button"),
  frame: document.getElementById("stream-frame"),
  actionsList: document.getElementById("stream-actions-list"),
};

let uiStateInterval = 0;
let currentPlayerUrl = "";

function init() {
  elements.closeButton.addEventListener("click", closeStream);
  void loadUiState();
  uiStateInterval = window.setInterval(loadUiState, 1000);
}

async function loadUiState() {
  try {
    const response = await fetch(`${STREAM_ENDPOINTS.uiState}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`UI-State konnte nicht geladen werden (${response.status})`);
    }

    const payload = await response.json();
    const state = payload.ui_state;

    if (!state || !state.active) {
      window.clearInterval(uiStateInterval);
      window.location.replace(payload.dashboardPath || "/status/");
      return;
    }

    renderState(state, payload.dashboardPath || "/status/");
  } catch (error) {
    console.error(error);
    elements.statusNote.textContent = "Verbindung fehlt";
  }
}

function renderState(state, dashboardPath) {
  elements.title.textContent = state.title || "Live-Stream";
  elements.actionsTitle.textContent = state.showActions ? "Steuerung" : "Nur Ansicht";
  elements.statusNote.textContent = state.source || "live";
  updateCountdown(state.endsAt, dashboardPath);

  if (state.playerUrl && state.playerUrl !== currentPlayerUrl) {
    currentPlayerUrl = state.playerUrl;
    elements.frame.src = currentPlayerUrl;
  }

  renderActions(state.actions || []);
}

function updateCountdown(endsAt, dashboardPath) {
  if (!endsAt) {
    elements.countdown.textContent = "Offen";
    return;
  }

  const remainingMs = Math.max(0, endsAt - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  elements.countdown.textContent = `Noch ${remainingSeconds}s`;

  if (remainingSeconds <= 0) {
    window.location.replace(dashboardPath);
  }
}

function renderActions(actions) {
  if (!actions.length) {
    elements.actionsList.innerHTML = `
      <div class="empty-state">
        <p>Keine Aktionen fuer diesen Stream.</p>
      </div>
    `;
    return;
  }

  elements.actionsList.innerHTML = actions
    .map((action) => {
      return `
        <button class="stream-action-button" data-action-id="${escapeHtml(action.id)}" type="button">
          ${escapeHtml(action.label)}
        </button>
      `;
    })
    .join("");

  for (const button of elements.actionsList.querySelectorAll("[data-action-id]")) {
    button.addEventListener("click", () => triggerAction(button.dataset.actionId, button));
  }
}

async function triggerAction(actionId, button) {
  button.disabled = true;
  elements.statusNote.textContent = "Sende Aktion ...";

  try {
    const response = await fetch(`${STREAM_ENDPOINTS.actionBase}${encodeURIComponent(actionId)}`, {
      method: "POST",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Aktion fehlgeschlagen (${response.status})`);
    }

    elements.statusNote.textContent = "Aktion ausgefuehrt";
  } catch (error) {
    console.error(error);
    elements.statusNote.textContent = "Aktion fehlgeschlagen";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
    }, 1200);
  }
}

async function closeStream() {
  elements.closeButton.disabled = true;

  try {
    await fetch(STREAM_ENDPOINTS.close, {
      method: "GET",
      cache: "no-store",
    });
  } finally {
    window.location.replace("/status/");
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
