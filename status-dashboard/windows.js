const WINDOWS_STATUS_ENDPOINT = "/api/windows/status";

const elements = {
  subtitle: document.getElementById("windows-subtitle"),
  summaryOrb: document.getElementById("window-summary-orb"),
  summaryLabel: document.getElementById("window-summary-label"),
  summaryDetail: document.getElementById("window-summary-detail"),
  grid: document.getElementById("window-grid"),
  refresh: document.getElementById("windows-refresh"),
};

function windowIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.5");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>';
  return icon;
}

function stateLabel(state) {
  return state === "open" ? "Geöffnet" : state === "closed" ? "Geschlossen" : "Nicht erreichbar";
}

function renderWindows(windows) {
  elements.grid.replaceChildren();
  if (windows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "windows-empty";
    empty.textContent = "Noch keine Fenster angelegt.";
    elements.grid.append(empty);
    return;
  }

  for (const windowEntry of windows) {
    const card = document.createElement("article");
    card.className = `window-card window-card--${windowEntry.state}`;

    const icon = document.createElement("div");
    icon.className = "window-card-icon";
    icon.append(windowIcon());

    const info = document.createElement("div");
    info.className = "window-card-info";
    const room = document.createElement("p");
    room.className = "window-card-room";
    room.textContent = windowEntry.room || "Fenster";
    const name = document.createElement("h2");
    name.textContent = windowEntry.name;
    info.append(room, name);

    const state = document.createElement("span");
    state.className = "window-state";
    state.textContent = stateLabel(windowEntry.state);

    card.append(icon, info, state);
    elements.grid.append(card);
  }
}

function updateSummary(windows) {
  const open = windows.filter((entry) => entry.state === "open");
  const unknown = windows.filter((entry) => entry.state === "unknown");
  elements.summaryOrb.classList.toggle("window-summary-orb--alert", open.length > 0);
  elements.summaryOrb.classList.toggle("window-summary-orb--unknown", open.length === 0 && unknown.length > 0);

  if (open.length > 0) {
    elements.summaryLabel.textContent = `${open.length} Fenster geöffnet`;
    elements.summaryDetail.textContent = open.map((entry) => entry.name).join(" · ");
  } else if (unknown.length > 0) {
    elements.summaryLabel.textContent = "Status teilweise nicht erreichbar";
    elements.summaryDetail.textContent = `${unknown.length} Kontakt${unknown.length === 1 ? "" : "e"} ohne Wert`;
  } else {
    elements.summaryLabel.textContent = "Alles geschlossen";
    elements.summaryDetail.textContent = `${windows.length} Fenster geprüft`;
  }
}

function formatUpdatedAt(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf())
    ? "Gerade aktualisiert"
    : `Aktualisiert um ${date.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`;
}

async function loadWindows() {
  elements.refresh.disabled = true;
  elements.subtitle.textContent = "Aktualisiere Zustände …";
  try {
    const response = await fetch(`${WINDOWS_STATUS_ENDPOINT}?t=${Date.now()}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.Status !== "OK") {
      throw new Error(result.Message || "Fensterstatus konnte nicht geladen werden.");
    }
    const windows = Array.isArray(result.windows) ? result.windows : [];
    renderWindows(windows);
    updateSummary(windows);
    elements.subtitle.textContent = formatUpdatedAt(result.updatedAt);
  } catch (error) {
    console.error(error);
    elements.subtitle.textContent = error.message || "Fensterstatus konnte nicht geladen werden.";
    elements.summaryLabel.textContent = "Keine Verbindung zu ioBroker";
    elements.summaryDetail.textContent = "Bitte später erneut versuchen.";
    elements.summaryOrb.classList.add("window-summary-orb--unknown");
    elements.grid.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "windows-empty";
    empty.textContent = "Die Fensterkontakte sind momentan nicht erreichbar.";
    elements.grid.append(empty);
  } finally {
    elements.refresh.disabled = false;
  }
}

elements.refresh.addEventListener("click", () => void loadWindows());
void loadWindows();
window.setInterval(loadWindows, 10000);
