const WINDOWS_ENDPOINT = "/api/windows";

const elements = {
  status: document.getElementById("window-settings-status"),
  list: document.getElementById("window-settings-list"),
  form: document.getElementById("window-add-form"),
  name: document.getElementById("new-window-name"),
  room: document.getElementById("new-window-room"),
  source: document.getElementById("new-window-source"),
  trueMeans: document.getElementById("new-window-true-means"),
};

let windows = [];

function createId(name) {
  const base = name.toLocaleLowerCase("de-AT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "fenster";
  let id = base;
  let number = 2;
  while (windows.some((entry) => entry.id === id)) {
    id = `${base}-${number++}`;
  }
  return id.slice(0, 80);
}

function renderWindows() {
  elements.list.replaceChildren();
  if (windows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "windows-empty";
    empty.textContent = "Noch keine Fenster angelegt.";
    elements.list.append(empty);
    return;
  }
  for (const entry of windows) {
    const row = document.createElement("article");
    row.className = "window-setting-row";
    const info = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = entry.name;
    const room = document.createElement("p");
    room.textContent = entry.room || "Ohne Raumangabe";
    const source = document.createElement("code");
    source.textContent = entry.sourceId;
    info.append(title, room, source);

    // "Wahr" heißt geöffnet (invert=false) oder geschlossen (invert=true, z. B. zigbee2mqtt).
    const trueMeans = document.createElement("select");
    trueMeans.className = "window-true-select";
    trueMeans.setAttribute("aria-label", `Bedeutung von Wahr für ${entry.name}`);
    for (const [value, label] of [["open", "Wahr = geöffnet"], ["closed", "Wahr = geschlossen"]]) {
      trueMeans.append(new Option(label, value));
    }
    trueMeans.value = entry.invert ? "closed" : "open";
    trueMeans.addEventListener("change", () => {
      entry.invert = trueMeans.value === "closed";
      void saveWindows("Einstellung gespeichert");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-window-button";
    remove.textContent = "Entfernen";
    remove.addEventListener("click", () => {
      windows = windows.filter((item) => item.id !== entry.id);
      renderWindows();
      void saveWindows("Fenster entfernt");
    });

    const controls = document.createElement("div");
    controls.className = "window-setting-controls";
    controls.append(trueMeans, remove);
    row.append(info, controls);
    elements.list.append(row);
  }
}

async function saveWindows(successMessage) {
  elements.status.textContent = "Speichere …";
  try {
    const response = await fetch(WINDOWS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.Status !== "OK") {
      throw new Error(result.Message || "Fenster konnten nicht gespeichert werden.");
    }
    windows = Array.isArray(result.windows) ? result.windows : windows;
    renderWindows();
    elements.status.textContent = successMessage;
  } catch (error) {
    console.error(error);
    elements.status.textContent = error.message || "Fenster konnten nicht gespeichert werden.";
  }
}

async function loadWindows() {
  try {
    const response = await fetch(`${WINDOWS_ENDPOINT}?t=${Date.now()}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.Status !== "OK") {
      throw new Error(result.Message || "Fenster konnten nicht geladen werden.");
    }
    windows = Array.isArray(result.windows) ? result.windows : [];
    renderWindows();
    elements.status.textContent = `${windows.length} Fenster eingerichtet`;
  } catch (error) {
    elements.status.textContent = error.message || "Fenster konnten nicht geladen werden.";
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.name.value.trim();
  const sourceId = elements.source.value.trim();
  if (!name || !sourceId) return;
  windows.push({
    id: createId(name),
    name,
    room: elements.room.value.trim(),
    sourceId,
    invert: elements.trueMeans.value === "closed",
  });
  elements.form.reset();
  renderWindows();
  void saveWindows("Fenster hinzugefügt");
});

void loadWindows();
