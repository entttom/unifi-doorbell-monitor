const STREAM_ENDPOINTS = {
  uiState: "/api/ui_state",
  close: "/api/kill_stream_window",
  actionBase: "/api/actions/",
  switchCamera: "/api/switch_stream_camera",
};

const elements = {
  actionsTitle: document.getElementById("stream-actions-title"),
  statusNote: document.getElementById("stream-status-note"),
  frame: document.getElementById("stream-frame"),
  frameWrap: document.getElementById("stream-frame-wrap"),
  actionsList: document.getElementById("stream-actions-list"),
  actionsPanel: document.getElementById("stream-actions-panel"),
  cameraSwitchWrap: document.getElementById("stream-camera-switch-wrap"),
  cameraSwitchButton: document.getElementById("stream-camera-switch-button"),
};

let closingStream = false;

let uiStateInterval = 0;
let currentPlayerUrl = "";
let lastDashboardPath = "/status/";

/** Timer für automatisches Nachstarten, wenn go2rtc/Firefox Autoplay blockiert. */
let playbackAssistTimer = 0;
let playbackAssistUntil = 0;

const PLAYBACK_ASSIST_INTERVAL_MS = 2500;
const PLAYBACK_ASSIST_MAX_MS = 90000;

function stopPlaybackAssist() {
  if (playbackAssistTimer) {
    window.clearInterval(playbackAssistTimer);
    playbackAssistTimer = 0;
  }
  playbackAssistUntil = 0;
}

function startPlaybackAssist() {
  stopPlaybackAssist();
  playbackAssistUntil = Date.now() + PLAYBACK_ASSIST_MAX_MS;
  const tick = () => {
    if (Date.now() > playbackAssistUntil) {
      stopPlaybackAssist();
      return;
    }
    void tryResumeGo2rtcPlayback().then((playing) => {
      if (playing) {
        stopPlaybackAssist();
      }
    });
  };
  tick();
  playbackAssistTimer = window.setInterval(tick, PLAYBACK_ASSIST_INTERVAL_MS);
}

/**
 * Liefert das Haupt-Video im go2rtc-iframe (same-origin über /go2rtc-Proxy).
 */
function pickPrimaryVideo(doc) {
  const videos = doc.querySelectorAll("video");
  if (!videos.length) {
    return null;
  }
  for (const video of videos) {
    const stream = video.srcObject;
    if (stream && stream.getVideoTracks().some((t) => t.readyState === "live")) {
      return video;
    }
  }
  return videos[0];
}

/**
 * Versucht Wiedergabe zu starten (wie go2rtc: bei Fehlschlag stumm schalten und erneut).
 * @returns {Promise<boolean>} true wenn das Video läuft oder nichts zu tun war
 */
async function tryResumeGo2rtcPlayback() {
  const frame = elements.frame;
  if (!frame || !frame.src) {
    return true;
  }
  let doc;
  try {
    doc = frame.contentDocument;
  } catch {
    return true;
  }
  if (!doc) {
    return false;
  }
  const video = pickPrimaryVideo(doc);
  if (!video) {
    return false;
  }
  if (!video.paused) {
    return true;
  }
  const hasMedia =
    Boolean(video.srcObject) ||
    video.readyState >= HTMLMediaElement.HAVE_METADATA ||
    Boolean(video.src);
  if (!hasMedia) {
    return false;
  }
  try {
    await video.play();
    return true;
  } catch {
    if (!video.muted) {
      video.muted = true;
      try {
        await video.play();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function init() {
  if (elements.frame) {
    elements.frame.addEventListener("load", () => {
      void tryResumeGo2rtcPlayback();
    });
  }
  if (elements.frameWrap) {
    elements.frameWrap.addEventListener("click", () => {
      void closeStream();
    });
    elements.frameWrap.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void closeStream();
      }
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      void closeStream();
    }
  });
  if (elements.cameraSwitchButton) {
    elements.cameraSwitchButton.addEventListener("click", () => {
      const mode = elements.cameraSwitchButton.dataset.mode;
      if (mode) {
        void switchCameraMode(mode);
      }
    });
  }
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
      stopPlaybackAssist();
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
  lastDashboardPath = dashboardPath || lastDashboardPath;
  document.title = state.title ? `${state.title} · Stream` : "Stream";
  elements.actionsTitle.textContent = state.showActions ? "Steuerung" : "Nur Ansicht";
  elements.statusNote.textContent = state.source || "live";
  updateCountdown(state.endsAt, lastDashboardPath);

  if (state.playerUrl && state.playerUrl !== currentPlayerUrl) {
    currentPlayerUrl = state.playerUrl;
    elements.frame.src = currentPlayerUrl;
    startPlaybackAssist();
  }

  const actions = state.actions || [];
  const cameraSwitch = state.cameraSwitch || null;
  renderActions(actions, Boolean(cameraSwitch));

  if (cameraSwitch && elements.cameraSwitchWrap && elements.cameraSwitchButton) {
    elements.cameraSwitchWrap.hidden = false;
    elements.cameraSwitchButton.textContent = cameraSwitch.label;
    elements.cameraSwitchButton.dataset.mode = cameraSwitch.mode;
  } else if (elements.cameraSwitchWrap) {
    elements.cameraSwitchWrap.hidden = true;
    if (elements.cameraSwitchButton) {
      delete elements.cameraSwitchButton.dataset.mode;
    }
  }

  setActionsSidebarCollapsed(actions.length === 0 && !cameraSwitch);
}

function setActionsSidebarCollapsed(collapsed) {
  document.body.classList.toggle("stream-page--no-actions", collapsed);
  if (elements.actionsPanel) {
    elements.actionsPanel.hidden = collapsed;
    elements.actionsPanel.setAttribute("aria-hidden", collapsed ? "true" : "false");
  }
}

function updateCountdown(endsAt, dashboardPath) {
  if (!endsAt) {
    return;
  }

  const remainingMs = Math.max(0, endsAt - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  if (remainingSeconds <= 0) {
    window.location.replace(dashboardPath);
  }
}

function renderActions(actions, hasCameraSwitch) {
  if (!actions.length) {
    if (hasCameraSwitch) {
      elements.actionsList.innerHTML = "";
    } else {
      elements.actionsList.innerHTML = `
      <div class="empty-state">
        <p>Keine Aktionen für diesen Stream.</p>
      </div>
    `;
    }
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

    elements.statusNote.textContent = "Aktion ausgeführt";
  } catch (error) {
    console.error(error);
    elements.statusNote.textContent = "Aktion fehlgeschlagen";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
    }, 1200);
  }
}

async function switchCameraMode(mode) {
  if (elements.cameraSwitchButton) {
    elements.cameraSwitchButton.disabled = true;
  }
  elements.statusNote.textContent = "Wechsle Kamera …";
  try {
    const response = await fetch(STREAM_ENDPOINTS.switchCamera, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Wechsel fehlgeschlagen");
    }
    const data = await response.json();
    if (data.ui_state) {
      renderState(data.ui_state, lastDashboardPath);
    } else {
      void loadUiState();
    }
  } catch (error) {
    console.error(error);
    elements.statusNote.textContent = "Kamerawechsel fehlgeschlagen";
  } finally {
    if (elements.cameraSwitchButton) {
      elements.cameraSwitchButton.disabled = false;
    }
  }
}

async function closeStream() {
  if (closingStream) {
    return;
  }
  closingStream = true;

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
