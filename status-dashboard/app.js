const CONFIG = {
  weather: {
    latitude: 48.2082,
    longitude: 16.3738,
    timezone: "Europe/Vienna",
  },
  endpoints: {
    calendar: "/api/calendar",
    uiState: "/api/ui_state",
    energy:
      "http://192.168.1.2:8087/getBulk/" +
      [
        "fronius.0.storage.0.StateOfCharge_Relative",
        "fronius.0.site.P_Akku",
        "fronius.0.site.P_Grid",
        "fronius.0.site.P_Load",
        "fronius.0.site.P_PV",
        "alias.0.mqtt.0.eas.hmu.CurrentConsumedPower",
        "modbus.0.holdingRegisters.51_OUTPUT_FREQ",
      ].join(","),
    frontYard: "/api/front_yard",
  },
  refresh: {
    clock: 1000,
    energy: 10000,
    weather: 10 * 60 * 1000,
    calendar: 15 * 60 * 1000,
  },
};

/** Schutz vor extrem großen ICS-Dateien (Messung läuft nur über diesen Ausschnitt). */
const CALENDAR_MAX_INSTANCES = 400;

let lastCalendarRawEvents = null;
let calendarLayoutFrame = 0;
let calendarRelayoutSuspended = 0;
let uiStatePollHandle = 0;

const WEATHER_CODE_LABELS = {
  0: "Klar",
  1: "Fast klar",
  2: "Leicht bewölkt",
  3: "Bewölkt",
  45: "Neblig",
  48: "Raureif",
  51: "Nieselregen",
  53: "Nieselregen",
  55: "Nieselregen",
  56: "Eisregen",
  57: "Eisregen",
  61: "Leichter Regen",
  63: "Regen",
  65: "Starker Regen",
  66: "Eisregen",
  67: "Eisregen",
  71: "Leichter Schnee",
  73: "Schnee",
  75: "Starker Schnee",
  77: "Schneekörner",
  80: "Schauer",
  81: "Schauer",
  82: "Starke Schauer",
  85: "Schneeschauer",
  86: "Schneeschauer",
  95: "Gewitter",
  96: "Gewitter",
  99: "Gewitter",
};

const elements = {
  protocolWarning: document.getElementById("protocol-warning"),
  clockTime: document.getElementById("clock-time"),
  clockDate: document.getElementById("clock-date"),
  calendarList: document.getElementById("calendar-list"),
  calendarStatus: document.getElementById("calendar-status"),
  weatherTemp: document.getElementById("weather-temp"),
  weatherSummary: document.getElementById("weather-summary"),
  weatherFeelsLike: document.getElementById("weather-feels-like"),
  weatherWind: document.getElementById("weather-wind"),
  weatherDays: document.getElementById("weather-days"),
  batteryChip: document.getElementById("battery-chip"),
  energyStatus: document.getElementById("energy-status"),
  energyPv: document.getElementById("energy-pv"),
  energyLoad: document.getElementById("energy-load"),
  energyGrid: document.getElementById("energy-grid"),
  energyBatteryPower: document.getElementById("energy-battery-power"),
  energySoc: document.getElementById("energy-soc"),
  heatingChip: document.getElementById("heating-chip"),
  heatingState: document.getElementById("heating-state"),
  frontYardButton: document.getElementById("front-yard-button"),
  settingsButton: document.getElementById("settings-button"),
};

function init() {
  if (window.location.protocol === "file:") {
    handleUnsupportedFileProtocol();
    updateClock();
    window.setInterval(updateClock, CONFIG.refresh.clock);
    return;
  }

  updateClock();
  window.setInterval(updateClock, CONFIG.refresh.clock);

  initCalendarLayoutObserver();
  loadCalendar();
  loadWeather();
  loadEnergy();
  void loadUiState();

  window.setInterval(loadCalendar, CONFIG.refresh.calendar);
  window.setInterval(loadWeather, CONFIG.refresh.weather);
  window.setInterval(loadEnergy, CONFIG.refresh.energy);
  uiStatePollHandle = window.setInterval(loadUiState, 1000);

  elements.frontYardButton.addEventListener("click", triggerFrontYard);
  elements.settingsButton.addEventListener("click", openSettings);
}

function initCalendarLayoutObserver() {
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  const ro = new ResizeObserver(() => {
    if (calendarRelayoutSuspended > 0 || !lastCalendarRawEvents) {
      return;
    }
    cancelAnimationFrame(calendarLayoutFrame);
    calendarLayoutFrame = requestAnimationFrame(() => {
      calendarLayoutFrame = 0;
      void renderCalendar(lastCalendarRawEvents, { animate: false });
    });
  });
  ro.observe(elements.calendarList);
}

function nextLayoutFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function calendarListFadeOut() {
  const el = elements.calendarList;
  el.classList.add("calendar-list--dim");
  await new Promise((resolve) => {
    const done = () => resolve();
    el.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 320);
  });
}

async function calendarListFadeIn() {
  const el = elements.calendarList;
  await nextLayoutFrame();
  el.classList.remove("calendar-list--dim");
}

function buildCalendarGroupsFromInstances(instancesSlice) {
  const groups = [];
  for (const inst of instancesSlice) {
    const groupKey = formatGroupKey(inst.day);
    let group = groups.find((entry) => entry.key === groupKey);
    if (!group) {
      group = {
        key: groupKey,
        label: formatGroupLabel(inst.day),
        events: [],
      };
      groups.push(group);
    }
    group.events.push(inst);
  }
  return groups;
}

function calendarGroupsHtml(groups) {
  return groups
    .map((group) => {
      const eventsMarkup = group.events
        .map((inst) => {
          return `
            <div class="calendar-event">
              <div class="calendar-time">${escapeHtml(inst.timeLabel)}</div>
              <div class="calendar-summary">${escapeHtml(inst.event.summary)}</div>
            </div>
          `;
        })
        .join("");

      return `
        <article class="calendar-day">
          <div class="calendar-day-header">
            <h3 class="calendar-day-title">${escapeHtml(group.label)}</h3>
          </div>
          <div class="calendar-events">${eventsMarkup}</div>
        </article>
      `;
    })
    .join("");
}

function countFittingCalendarInstances(capped) {
  const el = elements.calendarList;
  if (capped.length === 0) {
    return 0;
  }

  if (el.clientHeight <= 4) {
    return Math.min(capped.length, 24);
  }

  const tolerance = 3;
  let lo = 1;
  let hi = capped.length;
  let best = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const groups = buildCalendarGroupsFromInstances(capped.slice(0, mid));
    el.innerHTML = calendarGroupsHtml(groups);
    const fits = el.scrollHeight <= el.clientHeight + tolerance;
    if (fits) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === 0) {
    best = 1;
  }
  return Math.min(best, capped.length);
}

function handleUnsupportedFileProtocol() {
  elements.protocolWarning.classList.remove("hidden");
  elements.calendarStatus.textContent = "Nur per http:// verfügbar";
  elements.energyStatus.textContent = "Nur per http:// verfügbar";
  elements.frontYardButton.disabled = true;
  renderCalendarMessage("Bitte das Dashboard über einen lokalen Webserver starten.");
  renderWeatherFallback("Bitte per http:// starten.");
  renderEnergyFallback();
}

async function loadUiState() {
  try {
    const response = await fetch(`${CONFIG.endpoints.uiState}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`UI-State konnte nicht geladen werden (${response.status})`);
    }

    const data = await response.json();
    if (data && data.ui_state && data.ui_state.active && data.streamPath) {
      window.clearInterval(uiStatePollHandle);
      window.location.replace(data.streamPath);
    }
  } catch (error) {
    console.error(error);
  }
}

function updateClock() {
  const now = new Date();
  elements.clockTime.textContent = new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  elements.clockDate.textContent = new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

async function loadCalendar() {
  elements.calendarStatus.textContent = "Lade Kalender ...";

  try {
    const response = await fetch(`${CONFIG.endpoints.calendar}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Kalender konnte nicht geladen werden (${response.status})`);
    }

    const rawIcs = await response.text();
    const events = parseIcs(rawIcs);
    await renderCalendar(events);
    elements.calendarStatus.textContent = "";
    elements.calendarStatus.classList.add("hidden");
  } catch (error) {
    console.error(error);
    lastCalendarRawEvents = null;
    if (!prefersReducedMotion()) {
      await calendarListFadeOut();
    }
    renderCalendarMessage("Kalender momentan nicht verfügbar.");
    if (!prefersReducedMotion()) {
      await calendarListFadeIn();
    }
    elements.calendarStatus.textContent = "Fehler";
    elements.calendarStatus.classList.remove("hidden");
  }
}

function parseIcs(rawIcs) {
  const unfolded = rawIcs.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current && current.dtstart && current.summary) {
        events.push(normalizeEvent(current));
      }
      current = null;
      continue;
    }

    if (!current || !line.includes(":")) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    const keyPart = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    const segments = keyPart.split(";");
    const key = segments[0].toUpperCase();
    const params = {};

    for (const segment of segments.slice(1)) {
      const [paramKey, paramValue] = segment.split("=");
      params[paramKey.toUpperCase()] = paramValue;
    }

    current[key.toLowerCase()] = { value, params };
  }

  return events;
}

function normalizeEvent(rawEvent) {
  const start = parseIcsDate(rawEvent.dtstart.value);
  const end = rawEvent.dtend ? parseIcsDate(rawEvent.dtend.value) : null;
  const isAllDay = !rawEvent.dtstart.value.includes("T");

  return {
    summary: decodeIcsText(rawEvent.summary.value),
    start,
    end,
    isAllDay,
  };
}

function parseIcsDate(value) {
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day, 0, 0, 0);
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15) || "0");

  if (value.endsWith("Z")) {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  return new Date(year, month, day, hour, minute, second);
}

function decodeIcsText(value) {
  return value
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/g, " ")
    .replace(/\\\\/g, "\\")
    .trim();
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function compareDateOnly(a, b) {
  const da = startOfLocalDay(a).getTime();
  const db = startOfLocalDay(b).getTime();
  if (da === db) return 0;
  return da < db ? -1 : 1;
}

/** Letzter Kalendertag des Events (lokal). Bei VALUE=DATE ist DTEND exklusiv. */
function lastInclusiveDay(event) {
  if (event.isAllDay) {
    if (!event.end) {
      return startOfLocalDay(event.start);
    }
    return addDays(startOfLocalDay(event.end), -1);
  }
  if (!event.end) {
    return startOfLocalDay(event.start);
  }
  return startOfLocalDay(event.end);
}

function eachEventDay(event) {
  const first = startOfLocalDay(event.start);
  const last = lastInclusiveDay(event);
  const days = [];
  for (let d = new Date(first); compareDateOnly(d, last) <= 0; d = addDays(d, 1)) {
    days.push(startOfLocalDay(d));
  }
  return days;
}

function formatEventTimeOnDay(event, day) {
  if (event.isAllDay) {
    return "Ganztag";
  }
  if (!event.end) {
    return formatTime(event.start);
  }

  const startDay = startOfLocalDay(event.start);
  const endDay = startOfLocalDay(event.end);
  const dayTime = startOfLocalDay(day).getTime();

  if (startDay.getTime() === endDay.getTime()) {
    return `${formatTime(event.start)} - ${formatTime(event.end)}`;
  }

  const isFirst = dayTime === startDay.getTime();
  const isLast = dayTime === endDay.getTime();

  if (isFirst && isLast) {
    return `${formatTime(event.start)} - ${formatTime(event.end)}`;
  }
  if (isFirst) {
    return `${formatTime(event.start)} –`;
  }
  if (isLast) {
    return `– ${formatTime(event.end)}`;
  }
  return "—";
}

function expandEventToVisibleInstances(event, startOfToday) {
  return eachEventDay(event)
    .filter((d) => compareDateOnly(d, startOfToday) >= 0)
    .map((d) => ({
      event,
      day: d,
      timeLabel: formatEventTimeOnDay(event, d),
      sortTime: event.start.getTime(),
    }));
}

async function renderCalendar(events, options = {}) {
  const { animate = true } = options;
  calendarRelayoutSuspended += 1;
  try {
  if (!animate) {
    elements.calendarList.classList.remove("calendar-list--dim");
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const futureEvents = events
    .filter((event) => {
      if (event.isAllDay) {
        return compareDateOnly(lastInclusiveDay(event), startOfToday) >= 0;
      }

      if (event.end) {
        return event.end >= now;
      }

      return event.start >= now;
    })
    .sort((left, right) => left.start - right.start);

  if (futureEvents.length === 0) {
    lastCalendarRawEvents = null;
    if (animate && !prefersReducedMotion()) {
      await calendarListFadeOut();
    }
    renderCalendarMessage("Keine kommenden Termine gefunden.");
    if (animate && !prefersReducedMotion()) {
      await calendarListFadeIn();
    }
    return;
  }

  const instances = futureEvents
    .flatMap((event) => expandEventToVisibleInstances(event, startOfToday))
    .sort((a, b) => {
      const dayCmp = a.day.getTime() - b.day.getTime();
      if (dayCmp !== 0) return dayCmp;
      return a.sortTime - b.sortTime;
    });

  const capped = instances.slice(0, CALENDAR_MAX_INSTANCES);
  lastCalendarRawEvents = events;

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {
      /* ignore */
    }
  }
  await nextLayoutFrame();

  if (animate && !prefersReducedMotion()) {
    await calendarListFadeOut();
  }

  const n = countFittingCalendarInstances(capped);
  const finalGroups = buildCalendarGroupsFromInstances(capped.slice(0, n));
  elements.calendarList.innerHTML = calendarGroupsHtml(finalGroups);

  if (animate && !prefersReducedMotion()) {
    await calendarListFadeIn();
  }
  } finally {
    calendarRelayoutSuspended -= 1;
  }
}

function renderCalendarMessage(message) {
  lastCalendarRawEvents = null;
  elements.calendarList.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function formatGroupKey(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatGroupLabel(date) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function loadWeather() {
  const params = new URLSearchParams({
    latitude: String(CONFIG.weather.latitude),
    longitude: String(CONFIG.weather.longitude),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: CONFIG.weather.timezone,
    forecast_days: "4",
    wind_speed_unit: "kmh",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Wetter konnte nicht geladen werden (${response.status})`);
    }

    const data = await response.json();
    renderWeather(data);
  } catch (error) {
    console.error(error);
    renderWeatherFallback();
  }
}

function renderWeather(data) {
  const current = data.current;
  elements.weatherTemp.textContent = formatTemperature(current.temperature_2m);
  elements.weatherSummary.textContent = weatherLabel(current.weather_code);
  elements.weatherFeelsLike.textContent = formatTemperature(current.apparent_temperature);
  elements.weatherWind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;

  const now = new Date();
  const currentHourIndex = data.hourly.time.findIndex((entry) => new Date(entry) >= now);
  // Nächste Stunden ist komplett entfernt.
  void currentHourIndex;

  const days = [];
  for (let index = 1; index < Math.min(data.daily.time.length, 4); index += 1) {
    days.push({
      label: new Intl.DateTimeFormat("de-AT", {
        weekday: "short",
      }).format(new Date(data.daily.time[index])),
      temperature: `${formatTemperature(data.daily.temperature_2m_max[index])} / ${formatTemperature(
        data.daily.temperature_2m_min[index]
      )}`,
    });
  }

  elements.weatherDays.innerHTML = days
    .map((day) => {
      return `
        <article class="weather-item">
          <div class="weather-item-label">${escapeHtml(day.label)}</div>
          <div class="weather-item-temp">${escapeHtml(day.temperature)}</div>
        </article>
      `;
    })
    .join("");
}

function renderWeatherFallback(message = "Wetter nicht verfügbar.") {
  elements.weatherTemp.textContent = "--";
  elements.weatherSummary.textContent = message;
  elements.weatherFeelsLike.textContent = "--";
  elements.weatherWind.textContent = "--";
  elements.weatherDays.innerHTML =
    '<div class="empty-state"><p>Keine Tageswerte verfügbar.</p></div>';
}

async function loadEnergy() {
  elements.energyStatus.textContent = "Lade Werte ...";

  try {
    const response = await fetch(CONFIG.endpoints.energy, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Energiedaten konnten nicht geladen werden (${response.status})`);
    }

    const data = await response.json();
    renderEnergy(data);
    elements.energyStatus.textContent = "";
    elements.energyStatus.classList.add("hidden");
  } catch (error) {
    console.error(error);
    renderEnergyFallback();
    elements.energyStatus.textContent = "Fehler";
    elements.energyStatus.classList.remove("hidden");
  }
}

function renderEnergy(data) {
  const [
    socEntry,
    batteryEntry,
    gridEntry,
    loadEntry,
    pvEntry,
    heatingPowerEntry,
    outputFreqEntry,
  ] = data;

  const soc = extractValue(socEntry);
  const batteryPower = extractValue(batteryEntry);
  const gridPower = extractValue(gridEntry);
  const loadPower = extractValue(loadEntry);
  const pvPower = extractValue(pvEntry);
  const heatingPower = extractValue(heatingPowerEntry);
  const outputFreq = extractValue(outputFreqEntry);

  elements.energyPv.textContent = formatPower(pvPower);
  elements.energyLoad.textContent = formatHousePower(loadPower);
  elements.energyBatteryPower.textContent = formatBatteryPower(batteryPower);
  elements.energySoc.textContent = Number.isFinite(soc) ? `${Math.round(soc)} %` : "--";
  updateBatteryFill(soc);

  elements.energyGrid.textContent = formatGridPower(gridPower);
  elements.energyGrid.classList.remove("positive", "negative", "neutral");

  if (!Number.isFinite(gridPower) || gridPower === 0) {
    elements.energyGrid.classList.add("neutral");
  } else if (gridPower > 0) {
    elements.energyGrid.classList.add("positive");
  } else {
    elements.energyGrid.classList.add("negative");
  }

  const heatingOn =
    (Number.isFinite(heatingPower) && heatingPower !== 0) ||
    (Number.isFinite(outputFreq) && outputFreq === 36);
  elements.heatingState.textContent = heatingOn ? "läuft" : "aus";
  elements.heatingChip.classList.remove("heating-on", "heating-off");
  elements.heatingChip.classList.add(heatingOn ? "heating-on" : "heating-off");
}

function renderEnergyFallback() {
  elements.energyPv.textContent = "--";
  elements.energyLoad.textContent = "--";
  elements.energyBatteryPower.textContent = "--";
  elements.energyGrid.textContent = "--";
  elements.energyGrid.classList.remove("positive", "negative");
  elements.energyGrid.classList.add("neutral");
  elements.energySoc.textContent = "--";
  updateBatteryFill(Number.NaN);
  elements.heatingState.textContent = "--";
  elements.heatingChip.classList.remove("heating-on", "heating-off");
}

function updateBatteryFill(soc) {
  if (!elements.batteryChip) return;

  if (!Number.isFinite(soc)) {
    elements.batteryChip.style.setProperty("--soc-fill", "0%");
    return;
  }

  const percent = Math.max(0, Math.min(100, soc));
  // CSS erwartet den Wert als Prozentsatz für die Breite.
  elements.batteryChip.style.setProperty("--soc-fill", `${percent}%`);
}

async function triggerFrontYard() {
  const lockStart = Date.now();
  const minLockMs = 3000;
  elements.frontYardButton.disabled = true;

  try {
    const response = await fetch(CONFIG.endpoints.frontYard, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Request fehlgeschlagen (${response.status})`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    const elapsed = Date.now() - lockStart;
    const remaining = Math.max(0, minLockMs - elapsed);
    window.setTimeout(() => {
      elements.frontYardButton.disabled = false;
    }, remaining);
  }
}

function openSettings() {
  window.location.assign("/status/settings.html");
}

function extractValue(entry) {
  if (!entry || typeof entry.val === "undefined" || entry.val === null) {
    return Number.NaN;
  }

  return Number(entry.val);
}

function formatPower(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)} kW`;
  }

  return `${Math.round(value)} W`;
}

function formatPowerAbs(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const abs = Math.abs(value);

  if (abs >= 1000) {
    return `${(abs / 1000).toFixed(1)} kW`;
  }

  return `${Math.round(abs)} W`;
}

function formatHousePower(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  // Konvention: aktueller load-Wert => Vorzeichen zeigt "Verbrauch/Abgabe" umgedreht an.
  // Deshalb Labels entsprechend tauschen.
  const state = value >= 0 ? "Abgabe" : "Verbrauch";
  return `${formatPowerAbs(value)} ${state}`;
}

function formatBatteryPower(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  // Konvention: positives Akku => entlädt (gibt Energie ab), negatives => lädt (nimmt Energie auf)
  const state = value >= 0 ? "entlädt" : "lädt";
  return `${formatPowerAbs(value)} ${state}`;
}

function formatSignedPower(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (Math.abs(value) >= 1000) {
    return `${value >= 0 ? "+" : "-"}${Math.abs(value / 1000).toFixed(1)} kW`;
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))} W`;
}

function formatGridPower(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (value > 0) {
    return `Bezug ${formatPower(value)}`;
  }

  if (value < 0) {
    return `Einsp. ${formatPower(Math.abs(value))}`;
  }

  return "0 W";
}

function formatTemperature(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value)}°`;
}

function weatherLabel(code) {
  return WEATHER_CODE_LABELS[code] || "Unbekannt";
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
