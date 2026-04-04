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
};

let dashboardPath = "/status/";

function init() {
  elements.backButton.addEventListener("click", goBack);
  elements.saveButton.addEventListener("click", saveSettings);
  void loadSettings();
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
