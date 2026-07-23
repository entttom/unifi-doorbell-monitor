const SETTINGS_ENDPOINTS = {
  read: "/api/settings",
  save: "/api/settings",
};

const elements = {
  statusNote: document.getElementById("settings-status-note"),
  backButton: document.getElementById("settings-back-button"),
  saveButton: document.getElementById("settings-save-button"),
  calendarUrl: document.getElementById("calendar-url"),
  doorbellUrl: document.getElementById("doorbell-url"),
  frontyardUrl: document.getElementById("frontyard-url"),
  apiListen: document.getElementById("api-listen"),
  rtspListen: document.getElementById("rtsp-listen"),
  webrtcListen: document.getElementById("webrtc-listen"),
  mainTitle: document.getElementById("main-title"),
  frontyardTitle: document.getElementById("frontyard-title"),
  frontyardAfterRingTitle: document.getElementById("frontyard-after-ring-title"),
  gateLabel: document.getElementById("gate-label"),
  gateUrl: document.getElementById("gate-url"),
  doorLabel: document.getElementById("door-label"),
  doorUrl: document.getElementById("door-url"),
  soundsStatusNote: document.getElementById("sounds-status-note"),
  soundFileInput: document.getElementById("sound-file-input"),
  soundUploadButton: document.getElementById("sound-upload-button"),
  soundVolume: document.getElementById("sound-volume"),
  soundRepeat: document.getElementById("sound-repeat"),
  soundSpeed: document.getElementById("sound-speed"),
  soundPauseMs: document.getElementById("sound-pause-ms"),
  soundPauseEnabled: document.getElementById("sound-pause-enabled"),
  soundList: document.getElementById("sound-list"),
  soundApiExample: document.getElementById("sound-api-example"),
};

let dashboardPath = "/status/";
let sounds = [];

function init() {
  elements.backButton.addEventListener("click", goBack);
  elements.saveButton.addEventListener("click", saveSettings);
  elements.soundUploadButton.addEventListener("click", uploadSounds);
  elements.soundFileInput.addEventListener("change", () => {
    if (elements.soundFileInput.files.length > 0) {
      void uploadSounds();
    }
  });

  for (const input of [
    elements.soundVolume,
    elements.soundRepeat,
    elements.soundSpeed,
    elements.soundPauseMs,
    elements.soundPauseEnabled,
  ]) {
    input.addEventListener("change", updateApiExample);
    input.addEventListener("input", updateApiExample);
  }

  void loadSettings();
  void loadSounds();
}

function collectPlaybackParams() {
  const pauseEnabled = elements.soundPauseEnabled.checked;
  const params = {
    volume: Number(elements.soundVolume.value || 100),
    repeat: Number(elements.soundRepeat.value || 1),
    speed: Number(elements.soundSpeed.value || 1),
    pause: pauseEnabled,
  };

  if (pauseEnabled) {
    params.pauseMs = Number(elements.soundPauseMs.value || 0);
  }

  return params;
}

function buildPlayUrl(name) {
  const params = collectPlaybackParams();
  const query = new URLSearchParams({ file: name });
  query.set("volume", String(params.volume));
  query.set("repeat", String(params.repeat));
  query.set("speed", String(params.speed));
  query.set("pause", params.pause ? "true" : "false");
  if (params.pause) {
    query.set("pauseMs", String(params.pauseMs));
  }
  return `/api/play_sound?${query.toString()}`;
}

function updateApiExample() {
  const name = sounds.length > 0 ? sounds[0].name : "tuerklingen.mp3";
  elements.soundApiExample.textContent = buildPlayUrl(name);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function soundRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.Status !== "OK") {
    throw new Error(result.Message || `Anfrage fehlgeschlagen (${response.status})`);
  }
  return result;
}

async function loadSounds() {
  elements.soundsStatusNote.textContent = "Lade Sounds ...";

  try {
    const result = await soundRequest(`/api/sounds?t=${Date.now()}`);
    sounds = Array.isArray(result.sounds) ? result.sounds : [];
    renderSounds();
    elements.soundsStatusNote.textContent = result.player
      ? `${sounds.length} Sound(s) · Player: ${result.player}`
      : `${sounds.length} Sound(s) · kein Audio-Player installiert (ffplay, mpv, mpg123 oder cvlc)`;
  } catch (error) {
    console.error(error);
    elements.soundsStatusNote.textContent = error.message || "Sounds konnten nicht geladen werden";
  }
}

function renderSounds() {
  elements.soundList.replaceChildren();
  updateApiExample();

  if (sounds.length === 0) {
    const empty = document.createElement("li");
    empty.className = "sound-item sound-item--empty";
    empty.textContent = "Noch keine Sounds hochgeladen.";
    elements.soundList.append(empty);
    return;
  }

  for (const sound of sounds) {
    const item = document.createElement("li");
    item.className = "sound-item";

    const info = document.createElement("div");
    info.className = "sound-item-info";

    const name = document.createElement("span");
    name.className = "sound-item-name";
    name.textContent = sound.name;

    const meta = document.createElement("span");
    meta.className = "sound-item-meta";
    meta.textContent = formatSize(sound.sizeBytes);

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "sound-item-actions";
    actions.append(
      createSoundButton("Abspielen", () => playSound(sound.name)),
      createSoundButton("Stopp", () => stopSound(), true),
      createSoundButton("Umbenennen", () => renameSound(sound.name), true),
      createSoundButton("Löschen", () => deleteSound(sound.name), true)
    );

    item.append(info, actions);
    elements.soundList.append(item);
  }
}

function createSoundButton(label, handler, secondary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = secondary
    ? "action-button action-button-secondary sound-button"
    : "action-button sound-button";
  button.textContent = label;
  button.addEventListener("click", () => {
    void handler();
  });
  return button;
}

async function playSound(name) {
  elements.soundsStatusNote.textContent = `Spiele "${name}" ...`;
  try {
    const result = await soundRequest(buildPlayUrl(name));
    elements.soundsStatusNote.textContent = `"${name}" wird abgespielt (${result.player})`;
  } catch (error) {
    elements.soundsStatusNote.textContent = error.message || "Wiedergabe fehlgeschlagen";
  }
}

async function stopSound() {
  try {
    await soundRequest("/api/stop_sound");
    elements.soundsStatusNote.textContent = "Wiedergabe gestoppt";
  } catch (error) {
    elements.soundsStatusNote.textContent = error.message || "Stoppen fehlgeschlagen";
  }
}

async function renameSound(name) {
  const nextName = window.prompt("Neuer Dateiname (inkl. Endung):", name);
  if (!nextName || nextName === name) {
    return;
  }

  try {
    const result = await soundRequest(`/api/sounds/${encodeURIComponent(name)}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName: nextName }),
    });
    sounds = result.sounds || sounds;
    renderSounds();
    elements.soundsStatusNote.textContent = `Umbenannt in "${nextName}"`;
  } catch (error) {
    elements.soundsStatusNote.textContent = error.message || "Umbenennen fehlgeschlagen";
  }
}

async function deleteSound(name) {
  if (!window.confirm(`"${name}" wirklich löschen?`)) {
    return;
  }

  try {
    const result = await soundRequest(`/api/sounds/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    sounds = result.sounds || sounds;
    renderSounds();
    elements.soundsStatusNote.textContent = `"${name}" gelöscht`;
  } catch (error) {
    elements.soundsStatusNote.textContent = error.message || "Löschen fehlgeschlagen";
  }
}

async function uploadSounds() {
  const files = Array.from(elements.soundFileInput.files || []);
  if (files.length === 0) {
    elements.soundsStatusNote.textContent = "Bitte zuerst eine Datei auswählen";
    return;
  }

  elements.soundUploadButton.disabled = true;

  try {
    for (const file of files) {
      elements.soundsStatusNote.textContent = `Lade "${file.name}" hoch ...`;
      const result = await soundRequest(`/api/sounds/${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      sounds = result.sounds || sounds;
    }

    renderSounds();
    elements.soundFileInput.value = "";
    elements.soundsStatusNote.textContent =
      files.length === 1 ? `"${files[0].name}" hochgeladen` : `${files.length} Sounds hochgeladen`;
  } catch (error) {
    elements.soundsStatusNote.textContent = error.message || "Upload fehlgeschlagen";
  } finally {
    elements.soundUploadButton.disabled = false;
  }
}

async function loadSettings() {
  elements.statusNote.textContent = "Lade Konfiguration ...";

  try {
    const response = await fetch(`${SETTINGS_ENDPOINTS.read}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Konfiguration konnte nicht geladen werden (${response.status})`);
    }

    const payload = await response.json();
    const settings = payload.settings;
    dashboardPath = settings && settings.ui && settings.ui.dashboardPath ? settings.ui.dashboardPath : "/status/";
    fillForm(settings);
    elements.statusNote.textContent = "Konfiguration geladen";
  } catch (error) {
    console.error(error);
    elements.statusNote.textContent = "Konfiguration konnte nicht geladen werden";
  }
}

function fillForm(settings) {
  elements.calendarUrl.value = settings.calendarUrl || "";
  elements.doorbellUrl.value = settings.streams.doorbellUrl || "";
  elements.frontyardUrl.value = settings.streams.frontyardUrl || "";
  elements.apiListen.value = settings.streams.apiListen || "";
  elements.rtspListen.value = settings.streams.rtspListen || "";
  elements.webrtcListen.value = settings.streams.webrtcListen || "";
  elements.mainTitle.value = settings.ui.mainTitle || "";
  elements.frontyardTitle.value = settings.ui.frontYardTitle || "";
  elements.frontyardAfterRingTitle.value = settings.ui.frontYardAfterRingTitle || "";
  elements.gateLabel.value = settings.actions.openGate.label || "";
  elements.gateUrl.value = settings.actions.openGate.url || "";
  elements.doorLabel.value = settings.actions.openDoor.label || "";
  elements.doorUrl.value = settings.actions.openDoor.url || "";
}

function collectForm() {
  return {
    calendarUrl: elements.calendarUrl.value,
    streams: {
      doorbellUrl: elements.doorbellUrl.value,
      frontyardUrl: elements.frontyardUrl.value,
      apiListen: elements.apiListen.value,
      rtspListen: elements.rtspListen.value,
      webrtcListen: elements.webrtcListen.value,
    },
    ui: {
      mainTitle: elements.mainTitle.value,
      frontYardTitle: elements.frontyardTitle.value,
      frontYardAfterRingTitle: elements.frontyardAfterRingTitle.value,
    },
    actions: {
      openGate: {
        label: elements.gateLabel.value,
        url: elements.gateUrl.value,
      },
      openDoor: {
        label: elements.doorLabel.value,
        url: elements.doorUrl.value,
      },
    },
  };
}

async function saveSettings() {
  const payload = collectForm();
  elements.saveButton.disabled = true;
  elements.statusNote.textContent = "Speichere ...";

  try {
    const response = await fetch(SETTINGS_ENDPOINTS.save, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || result.Status !== "OK") {
      throw new Error(result.Message || `Speichern fehlgeschlagen (${response.status})`);
    }

    fillForm(result.settings);
    if (result.restart && result.restart.ok) {
      elements.statusNote.textContent = "Gespeichert und go2rtc neu gestartet";
    } else {
      elements.statusNote.textContent =
        "Gespeichert, aber go2rtc konnte nicht automatisch neu gestartet werden";
    }
  } catch (error) {
    console.error(error);
    elements.statusNote.textContent = error.message || "Speichern fehlgeschlagen";
  } finally {
    elements.saveButton.disabled = false;
  }
}

function goBack() {
  window.location.assign(dashboardPath);
}

init();
