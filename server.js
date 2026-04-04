const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { URL } = require('node:url');

const app = express();
const server = http.createServer(app);

const port = Number(process.env.PORT || 3000);
const GO2RTC_HTTP_PORT = Number(process.env.GO2RTC_HTTP_PORT || 1984);
const GO2RTC_HOST = process.env.GO2RTC_HOST || '127.0.0.1';
const WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY || 'wayland-0';
const XDG_RUNTIME_DIR_WLR =
  process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
const MONITOR_TIMEOUT_MS = 300000;
const STREAM_TIMEOUT_MS = 300000;

const STATUS_DIR = path.join(__dirname, 'status-dashboard');
const STATUS_CONFIG_DIR = path.join(STATUS_DIR, 'config');
const CONFIG_DIR = path.join(__dirname, 'config');
const CALENDAR_URL_PATH = path.join(STATUS_CONFIG_DIR, 'calendar-url.txt');
const CALENDAR_URL_EXAMPLE_PATH = path.join(STATUS_CONFIG_DIR, 'calendar-url.example.txt');
const APP_CONFIG_PATH = path.join(CONFIG_DIR, 'app-config.json');
const APP_CONFIG_EXAMPLE_PATH = path.join(CONFIG_DIR, 'app-config.example.json');
const GO2RTC_CONFIG_PATH = path.join(CONFIG_DIR, 'go2rtc.yaml');
const GO2RTC_CONFIG_EXAMPLE_PATH = path.join(CONFIG_DIR, 'go2rtc.yaml.example');

const DEFAULT_APP_CONFIG = {
  ui: {
    dashboardPath: '/status/',
    streamPath: '/status/stream.html',
    pollIntervalMs: 1000,
    go2rtcBasePath: '/go2rtc',
    streamModes: {
      main: {
        streamKey: 'doorbell',
        title: 'Haustür',
        showActions: true,
      },
      front_yard: {
        streamKey: 'frontyard',
        title: 'Vorgarten',
        showActions: false,
      },
      front_yard_after_ring: {
        streamKey: 'frontyard',
        title: 'Vorgarten',
        showActions: true,
      },
    },
  },
  actions: [
    {
      id: 'open-gate',
      label: 'Gartentor öffnen',
      method: 'GET',
      url: 'http://192.168.1.2:8087/set/openknx.0.Verbraucher.Garten_Garage.Gartentüre(Schalten)?value=true',
    },
    {
      id: 'open-door',
      label: 'Eingangstür öffnen',
      method: 'GET',
      url: 'http://192.168.1.2:8087/set/openknx.0.Verbraucher.Erdgeschoss.1_Vorraum-Türöffner(Schalten)?value=true',
    },
  ],
};

app.use(bodyParser.json());
app.use('/status', express.static(STATUS_DIR));

let appConfig = loadAppConfig();
let monitor_on = true;
let stream = false;
let stream_front_door = false;
let isChangingMonitor = false;
let timer = null;
let timer_start_time = null;
let timer_stream = null;
let timer_stream_start_time = null;
let uiState = createDefaultUiState();

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('Stream-Backend: go2rtc');
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/go2rtc/')) {
    socket.destroy();
    return;
  }

  const upstream = net.connect(GO2RTC_HTTP_PORT, GO2RTC_HOST, () => {
    const targetPath = req.url.replace(/^\/go2rtc/, '') || '/';
    const headerLines = [`${req.method} ${targetPath} HTTP/${req.httpVersion}`];

    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      const headerName = req.rawHeaders[index];
      const headerValue = req.rawHeaders[index + 1];
      const lower = headerName.toLowerCase();
      if (lower === 'host') {
        continue;
      }
      // Browser-Origin (z. B. http://Display-IP:3000) != go2rtc Host 127.0.0.1:1984 → sonst 403 am WS.
      if (lower === 'origin') {
        continue;
      }
      headerLines.push(`${headerName}: ${headerValue}`);
    }

    headerLines.push(`Host: ${GO2RTC_HOST}:${GO2RTC_HTTP_PORT}`);
    headerLines.push('');
    headerLines.push('');

    upstream.write(headerLines.join('\r\n'));
    if (head && head.length > 0) {
      upstream.write(head);
    }

    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on('error', () => {
    socket.destroy();
  });
});

function createDefaultUiState() {
  return {
    active: false,
    mode: null,
    streamKey: null,
    title: null,
    showActions: false,
    source: null,
    activatedAt: null,
    endsAt: null,
    ringSession: false,
  };
}

function loadAppConfig() {
  const configCandidates = [APP_CONFIG_PATH, APP_CONFIG_EXAMPLE_PATH];
  let loadedConfig = null;

  for (const candidate of configCandidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    try {
      loadedConfig = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      break;
    } catch (error) {
      console.error(`Konnte ${candidate} nicht lesen:`, error.message);
    }
  }

  const mergedUi = {
    ...DEFAULT_APP_CONFIG.ui,
    ...(loadedConfig && loadedConfig.ui ? loadedConfig.ui : {}),
    streamModes: {
      ...DEFAULT_APP_CONFIG.ui.streamModes,
      ...(loadedConfig && loadedConfig.ui && loadedConfig.ui.streamModes
        ? loadedConfig.ui.streamModes
        : {}),
    },
  };

  return {
    ui: mergedUi,
    actions:
      loadedConfig && Array.isArray(loadedConfig.actions)
        ? loadedConfig.actions
        : DEFAULT_APP_CONFIG.actions,
  };
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function normalizeText(value, fallback) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

function normalizeHttpUrl(value, fieldName, { allowEmpty = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    if (allowEmpty) {
      return '';
    }
    throw new Error(`${fieldName} ist erforderlich.`);
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error(`${fieldName} ist keine gueltige URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} muss mit http:// oder https:// beginnen.`);
  }

  return normalized;
}

function normalizeRtspUrl(value, fieldName) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${fieldName} ist erforderlich.`);
  }

  if (!normalized.startsWith('rtsp://')) {
    throw new Error(`${fieldName} muss mit rtsp:// beginnen.`);
  }

  return normalized;
}

async function readTextFile(filePath, fallbackPath = null) {
  try {
    return (await fsPromises.readFile(filePath, 'utf8')).trim();
  } catch (error) {
    if (fallbackPath) {
      return readTextFile(fallbackPath, null);
    }
    throw error;
  }
}

async function readGo2RtcConfigText() {
  return readTextFile(GO2RTC_CONFIG_PATH, GO2RTC_CONFIG_EXAMPLE_PATH);
}

function extractGo2RtcValue(configText, sectionName, defaultValue = '') {
  const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = configText.match(new RegExp(`^${escapedSection}:\\s*"?(.*?)"?$`, 'm'));
  return match ? match[1].trim() : defaultValue;
}

function extractYamlSection(configText, sectionName) {
  const lines = configText.split(/\r?\n/);
  const collected = [];
  let inSection = false;

  for (const line of lines) {
    if (!inSection) {
      if (line.trim() === `${sectionName}:`) {
        inSection = true;
      }
      continue;
    }

    if (line && !line.startsWith(' ')) {
      break;
    }

    collected.push(line);
  }

  return collected.join('\n');
}

function extractStreamUrl(configText, streamName, defaultValue = '') {
  const escapedName = streamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = configText.match(new RegExp(`^\\s*${escapedName}:\\s*$[\\r\\n]+^\\s*-\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : defaultValue;
}

async function loadGo2RtcSettings() {
  const configText = await readGo2RtcConfigText();
  const apiSection = extractYamlSection(configText, 'api');
  const rtspSection = extractYamlSection(configText, 'rtsp');
  const webrtcSection = extractYamlSection(configText, 'webrtc');

  return {
    apiListen: extractGo2RtcValue(apiSection, '  listen', '127.0.0.1:1984'),
    rtspListen: extractGo2RtcValue(rtspSection, '  listen', '127.0.0.1:8554'),
    webrtcListen: extractGo2RtcValue(webrtcSection, '  listen', ':8555'),
    doorbellUrl: extractStreamUrl(configText, 'doorbell'),
    frontyardUrl: extractStreamUrl(configText, 'frontyard'),
  };
}

async function loadSettingsPayload() {
  const currentCalendarUrl = await readTextFile(CALENDAR_URL_PATH, CALENDAR_URL_EXAMPLE_PATH);
  const go2rtcSettings = await loadGo2RtcSettings();
  const gateAction = appConfig.actions.find((action) => action.id === 'open-gate') || null;
  const doorAction = appConfig.actions.find((action) => action.id === 'open-door') || null;

  return {
    calendarUrl: currentCalendarUrl,
    streams: {
      doorbellUrl: go2rtcSettings.doorbellUrl,
      frontyardUrl: go2rtcSettings.frontyardUrl,
      apiListen: go2rtcSettings.apiListen,
      rtspListen: go2rtcSettings.rtspListen,
      webrtcListen: go2rtcSettings.webrtcListen,
    },
    ui: {
      mainTitle: getUiMode('main').title,
      frontYardTitle: getUiMode('front_yard').title,
      frontYardAfterRingTitle: getUiMode('front_yard_after_ring').title,
      dashboardPath: appConfig.ui.dashboardPath,
      streamPath: appConfig.ui.streamPath,
      go2rtcBasePath: appConfig.ui.go2rtcBasePath,
      pollIntervalMs: appConfig.ui.pollIntervalMs,
    },
    actions: {
      openGate: {
        label: gateAction ? gateAction.label : DEFAULT_APP_CONFIG.actions[0].label,
        method: gateAction ? gateAction.method || 'GET' : 'GET',
        url: gateAction ? gateAction.url : '',
      },
      openDoor: {
        label: doorAction ? doorAction.label : DEFAULT_APP_CONFIG.actions[1].label,
        method: doorAction ? doorAction.method || 'GET' : 'GET',
        url: doorAction ? doorAction.url : '',
      },
    },
  };
}

async function ensureConfigDirectories() {
  await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
  await fsPromises.mkdir(STATUS_CONFIG_DIR, { recursive: true });
}

function serializeGo2RtcConfig(settings) {
  return [
    'api:',
    `  listen: ${yamlQuote(settings.apiListen)}`,
    '',
    'rtsp:',
    `  listen: ${yamlQuote(settings.rtspListen)}`,
    '',
    'webrtc:',
    `  listen: ${yamlQuote(settings.webrtcListen)}`,
    '',
    'preload:',
    '  doorbell: "video"',
    '  frontyard: "video"',
    '',
    'streams:',
    '  doorbell:',
    `    - ${settings.doorbellUrl}`,
    '  frontyard:',
    `    - ${settings.frontyardUrl}`,
    '',
  ].join('\n');
}

function buildAppConfigFromSettings(input) {
  const gateAction = input.actions.openGate.url
    ? {
        id: 'open-gate',
        label: input.actions.openGate.label,
        method: 'GET',
        url: input.actions.openGate.url,
      }
    : null;

  const doorAction = input.actions.openDoor.url
    ? {
        id: 'open-door',
        label: input.actions.openDoor.label,
        method: 'GET',
        url: input.actions.openDoor.url,
      }
    : null;

  return {
    ui: {
      dashboardPath: appConfig.ui.dashboardPath,
      streamPath: appConfig.ui.streamPath,
      pollIntervalMs: appConfig.ui.pollIntervalMs,
      go2rtcBasePath: appConfig.ui.go2rtcBasePath,
      streamModes: {
        main: {
          streamKey: 'doorbell',
          title: input.ui.mainTitle,
          showActions: true,
        },
        front_yard: {
          streamKey: 'frontyard',
          title: input.ui.frontYardTitle,
          showActions: false,
        },
        front_yard_after_ring: {
          streamKey: 'frontyard',
          title: input.ui.frontYardAfterRingTitle,
          showActions: true,
        },
      },
    },
    actions: [gateAction, doorAction].filter(Boolean),
  };
}

function validateSettingsInput(rawInput) {
  const gateUrl = normalizeHttpUrl(
    rawInput && rawInput.actions && rawInput.actions.openGate
      ? rawInput.actions.openGate.url
      : '',
    'Gartentor-URL',
    { allowEmpty: true }
  );

  const doorUrl = normalizeHttpUrl(
    rawInput && rawInput.actions && rawInput.actions.openDoor
      ? rawInput.actions.openDoor.url
      : '',
    'Eingangstuer-URL',
    { allowEmpty: true }
  );

  return {
    calendarUrl: normalizeHttpUrl(rawInput ? rawInput.calendarUrl : '', 'Kalender-URL'),
    streams: {
      doorbellUrl: normalizeRtspUrl(
        rawInput && rawInput.streams ? rawInput.streams.doorbellUrl : '',
        'Doorbell-RTSP-URL'
      ),
      frontyardUrl: normalizeRtspUrl(
        rawInput && rawInput.streams ? rawInput.streams.frontyardUrl : '',
        'Frontyard-RTSP-URL'
      ),
      apiListen: normalizeText(
        rawInput && rawInput.streams ? rawInput.streams.apiListen : '',
        '127.0.0.1:1984'
      ),
      rtspListen: normalizeText(
        rawInput && rawInput.streams ? rawInput.streams.rtspListen : '',
        '127.0.0.1:8554'
      ),
      webrtcListen: normalizeText(
        rawInput && rawInput.streams ? rawInput.streams.webrtcListen : '',
        ':8555'
      ),
    },
    ui: {
      mainTitle: normalizeText(rawInput && rawInput.ui ? rawInput.ui.mainTitle : '', 'Haustür'),
      frontYardTitle: normalizeText(
        rawInput && rawInput.ui ? rawInput.ui.frontYardTitle : '',
        'Vorgarten'
      ),
      frontYardAfterRingTitle: normalizeText(
        rawInput && rawInput.ui ? rawInput.ui.frontYardAfterRingTitle : '',
        'Vorgarten'
      ),
    },
    actions: {
      openGate: {
        label: normalizeText(
          rawInput && rawInput.actions && rawInput.actions.openGate
            ? rawInput.actions.openGate.label
            : '',
          'Gartentor öffnen'
        ),
        url: gateUrl,
      },
      openDoor: {
        label: normalizeText(
          rawInput && rawInput.actions && rawInput.actions.openDoor
            ? rawInput.actions.openDoor.label
            : '',
          'Eingangstür öffnen'
        ),
        url: doorUrl,
      },
    },
  };
}

async function restartGo2RtcService() {
  const commands = [
    'sudo -n /bin/systemctl restart go2rtc',
    'sudo -n /usr/bin/systemctl restart go2rtc',
    '/bin/systemctl restart go2rtc',
    'systemctl restart go2rtc',
  ];

  for (const command of commands) {
    const result = await runCommand(command, 3000);
    if (result.ok) {
      return {
        ok: true,
        command,
      };
    }
  }

  return {
    ok: false,
    message: 'go2rtc konnte nicht automatisch neu gestartet werden.',
  };
}

function getUiMode(mode) {
  return appConfig.ui.streamModes[mode] || appConfig.ui.streamModes.main;
}

function updateLegacyStreamFlags() {
  stream = uiState.active;
  stream_front_door = uiState.active && uiState.mode === 'main';
}

function resetMonitorTimer() {
  clearTimeout(timer);
  timer_start_time = Date.now();
  timer = setTimeout(() => {
    console.log(`[TIMER] Auto-OFF ausgelöst um ${new Date().toISOString()}`);
    timer = null;
    turnMonitorOffCommand(() => {
      monitor_on = false;
      clearStreamState();
      timer_start_time = null;
    });
  }, MONITOR_TIMEOUT_MS);
}

function resetStreamTimer() {
  clearTimeout(timer_stream);
  timer_stream_start_time = Date.now();
  timer_stream = setTimeout(() => {
    console.log(`[STREAM_TIMER] Auto-Stop ausgelöst um ${new Date().toISOString()}`);
    timer_stream = null;
    clearStreamState();
    timer_stream_start_time = null;
  }, STREAM_TIMEOUT_MS);
}

function stopMonitorTimer() {
  clearTimeout(timer);
  timer = null;
  timer_start_time = null;
}

function stopStreamTimer() {
  clearTimeout(timer_stream);
  timer_stream = null;
  timer_stream_start_time = null;
}

function clearStreamState() {
  uiState = createDefaultUiState();
  updateLegacyStreamFlags();
}

function activateStreamMode(mode, source) {
  const modeConfig = getUiMode(mode);
  const activatedAt = Date.now();
  const prevRingSession = uiState && uiState.active ? uiState.ringSession : false;
  let ringSession = false;
  if (source === 'ring_ring') {
    ringSession = true;
  } else if (source === 'switch_camera') {
    ringSession = Boolean(prevRingSession);
  } else if (source === 'debug_preview') {
    // Wie nach Klingeln: Kamerawechsel-Button in stream.html testbar (/api/preview_stream_ui).
    ringSession = true;
  } else if (source === 'front_yard' && mode === 'front_yard_after_ring') {
    ringSession = true;
  } else if (source === 'front_yard' && mode === 'front_yard') {
    ringSession = false;
  }

  uiState = {
    active: true,
    mode,
    streamKey: modeConfig.streamKey,
    title: modeConfig.title,
    showActions: Boolean(modeConfig.showActions),
    source,
    activatedAt,
    endsAt: activatedAt + STREAM_TIMEOUT_MS,
    ringSession,
  };
  updateLegacyStreamFlags();
  resetStreamTimer();
}

function getConfiguredActions() {
  return appConfig.actions.map((action) => ({
    id: action.id,
    label: action.label,
    method: action.method || 'GET',
  }));
}

function getPlayerUrl(streamKey) {
  const basePath = (appConfig.ui.go2rtcBasePath || '/go2rtc').replace(/\/$/, '');
  return `${basePath}/stream.html?src=${encodeURIComponent(streamKey)}&mode=webrtc`;
}

function getAlternateCameraInfo(currentMode) {
  if (currentMode === 'main') {
    const target = getUiMode('front_yard');
    return {
      mode: 'front_yard',
      label: `Zu ${target.title} wechseln`,
    };
  }
  if (currentMode === 'front_yard' || currentMode === 'front_yard_after_ring') {
    const target = getUiMode('main');
    return {
      mode: 'main',
      label: `Zu ${target.title} wechseln`,
    };
  }
  return null;
}

function buildUiStatePayload() {
  const { ringSession, ...uiStateRest } = uiState;
  const cameraSwitch =
    uiState.active && ringSession && uiState.mode
      ? getAlternateCameraInfo(uiState.mode)
      : null;

  return {
    backend: 'go2rtc',
    dashboardPath: appConfig.ui.dashboardPath,
    streamPath: appConfig.ui.streamPath,
    settingsPath: '/status/settings.html',
    pollIntervalMs: appConfig.ui.pollIntervalMs,
    monitor_on,
    stream,
    stream_front_door,
    ui_state: {
      ...uiStateRest,
      playerUrl: uiState.streamKey ? getPlayerUrl(uiState.streamKey) : null,
      actions: uiState.active && uiState.showActions ? getConfiguredActions() : [],
      cameraSwitch,
    },
  };
}

function wlrRandrEnvPrefix() {
  return `XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR_WLR}" WAYLAND_DISPLAY="${WAYLAND_DISPLAY}"`;
}

function turnMonitorOnCommand(callback) {
  exec(`${wlrRandrEnvPrefix()} wlr-randr --output HDMI-A-1 --on`, callback);
}

function turnMonitorOffCommand(callback) {
  exec(`${wlrRandrEnvPrefix()} wlr-randr --output HDMI-A-1 --off`, callback);
}

function fetchText(urlString, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (error) {
      reject(error);
      return;
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          'User-Agent': 'raspi-status-dashboard/2.0',
          Accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.8',
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({ statusCode: response.statusCode || 0, body });
        });
      }
    );

    request.on('error', reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Request timeout'));
    });
    request.end();
  });
}

function fetchLocalJson(pathname, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: 'GET',
        hostname: GO2RTC_HOST,
        port: GO2RTC_HTTP_PORT,
        path: pathname,
        headers: {
          Accept: 'application/json',
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode || 0) >= 400) {
            reject(new Error(`HTTP ${(response.statusCode || 0)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on('error', reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Request timeout'));
    });
    request.end();
  });
}

function ensureMonitorOn(res, onReady) {
  if (monitor_on) {
    resetMonitorTimer();
    onReady();
    return;
  }

  if (isChangingMonitor) {
    res.status(200).json({ Status: 'AlreadyPending' });
    return;
  }

  isChangingMonitor = true;
  turnMonitorOnCommand((error) => {
    isChangingMonitor = false;
    if (error) {
      monitor_on = false;
      res.status(500).json({ Status: 'Error', Message: error.message });
      return;
    }

    monitor_on = true;
    resetMonitorTimer();
    onReady();
  });
}

function proxyGo2RtcHttp(req, res) {
  const targetPath = req.originalUrl.replace(/^\/go2rtc/, '') || '/';
  const upstream = http.request(
    {
      hostname: GO2RTC_HOST,
      port: GO2RTC_HTTP_PORT,
      method: req.method,
      path: targetPath,
      headers: {
        ...req.headers,
        host: `${GO2RTC_HOST}:${GO2RTC_HTTP_PORT}`,
      },
    },
    (upstreamResponse) => {
      res.status(upstreamResponse.statusCode || 502);
      for (const [header, value] of Object.entries(upstreamResponse.headers)) {
        if (typeof value !== 'undefined') {
          res.setHeader(header, value);
        }
      }
      upstreamResponse.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    res.status(502).json({
      Status: 'Error',
      Message: `go2rtc proxy failed: ${error.message}`,
    });
  });

  req.pipe(upstream);
}

function getMonitorStatus() {
  return new Promise((resolve) => {
    exec(`${wlrRandrEnvPrefix()} wlr-randr`, (error, stdout) => {
      if (error || !stdout) {
        resolve({
          actualMonitorStatus: 'unknown',
          rawOutput: error ? error.message : '',
        });
        return;
      }

      const hdmiMatch = stdout.match(/HDMI-A-1[\s\S]*?(?=\n\w|$)/);
      resolve({
        actualMonitorStatus:
          hdmiMatch && hdmiMatch[0].includes('Enabled: yes') ? 'on' : 'off',
        rawOutput: stdout,
      });
    });
  });
}

function runCommand(command, timeoutMs = 4000) {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
      });
    });
  });
}

async function getGo2RtcStatus() {
  try {
    const streams = await fetchLocalJson('/api/streams');
    return {
      healthy: true,
      streamCount: Array.isArray(streams) ? streams.length : Object.keys(streams || {}).length,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}

function sendJsonOk(res, extra = {}) {
  res.status(200).json({
    Status: 'OK',
    ...extra,
  });
}

app.use('/go2rtc', proxyGo2RtcHttp);

app.get('/api/calendar', async (req, res) => {
  let calendarUrl;

  try {
    calendarUrl = (await fsPromises.readFile(CALENDAR_URL_PATH, 'utf8')).trim();
  } catch (error) {
    res.status(404).send('calendar-url.txt not found');
    return;
  }

  if (!calendarUrl) {
    res.status(400).send('calendar-url.txt is empty');
    return;
  }

  try {
    const { statusCode, body } = await fetchText(calendarUrl, 15000);

    if (statusCode < 200 || statusCode >= 300) {
      res.status(502).send(`Calendar upstream error: ${statusCode}`);
      return;
    }

    res.status(200)
      .set('Content-Type', 'text/calendar; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(body);
  } catch (error) {
    res.status(502).send(
      `Calendar upstream error: ${error && error.message ? error.message : String(error)}`
    );
  }
});

app.get('/api/ui_state', (req, res) => {
  sendJsonOk(res, buildUiStatePayload());
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await loadSettingsPayload();
    sendJsonOk(res, {
      settings,
      service: {
        restartCommand: 'sudo systemctl restart go2rtc',
      },
    });
  } catch (error) {
    res.status(500).json({
      Status: 'Error',
      Message: error.message,
    });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const normalized = validateSettingsInput(req.body || {});
    const nextAppConfig = buildAppConfigFromSettings(normalized);
    const nextGo2RtcConfig = serializeGo2RtcConfig(normalized.streams);

    await ensureConfigDirectories();
    await fsPromises.writeFile(
      APP_CONFIG_PATH,
      `${JSON.stringify(nextAppConfig, null, 2)}\n`,
      'utf8'
    );
    await fsPromises.writeFile(GO2RTC_CONFIG_PATH, nextGo2RtcConfig, 'utf8');
    await fsPromises.writeFile(CALENDAR_URL_PATH, `${normalized.calendarUrl}\n`, 'utf8');

    appConfig = loadAppConfig();
    if (uiState.active) {
      const refreshedMode = getUiMode(uiState.mode);
      uiState = {
        ...uiState,
        title: refreshedMode.title,
      };
    }

    const restart = await restartGo2RtcService();
    sendJsonOk(res, {
      saved: true,
      restart,
      settings: await loadSettingsPayload(),
    });
  } catch (error) {
    res.status(400).json({
      Status: 'Error',
      Message: error.message,
    });
  }
});

app.all('/api/actions/:id', async (req, res) => {
  const action = appConfig.actions.find((entry) => entry.id === req.params.id);
  if (!action) {
    res.status(404).json({ Status: 'Error', Message: 'Unknown action' });
    return;
  }

  try {
    const parsed = new URL(action.url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const response = await new Promise((resolve, reject) => {
      const actionRequest = transport.request(
        {
          method: action.method || 'GET',
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          headers: {
            'User-Agent': 'unifi-doorbell-monitor/2.0',
          },
        },
        (actionResponse) => {
          let body = '';
          actionResponse.setEncoding('utf8');
          actionResponse.on('data', (chunk) => {
            body += chunk;
          });
          actionResponse.on('end', () => {
            resolve({
              statusCode: actionResponse.statusCode || 0,
              body,
            });
          });
        }
      );

      actionRequest.on('error', reject);
      actionRequest.end();
    });

    sendJsonOk(res, {
      action: {
        id: action.id,
        label: action.label,
      },
      upstream: response,
    });
  } catch (error) {
    res.status(502).json({
      Status: 'Error',
      Message: error.message,
    });
  }
});

app.get('/api/ring_ring', (req, res) => {
  console.log(`[RING_RING] Called at ${new Date().toISOString()}, monitor_on=${monitor_on}`);
  ensureMonitorOn(res, () => {
    activateStreamMode('main', 'ring_ring');
    sendJsonOk(res, {
      backend: 'go2rtc',
      ui_state: buildUiStatePayload().ui_state,
    });
  });
});

app.get('/api/front_yard', (req, res) => {
  console.log(`[FRONT_YARD] Called at ${new Date().toISOString()}, monitor_on=${monitor_on}`);
  ensureMonitorOn(res, () => {
    const nextMode = stream_front_door ? 'front_yard_after_ring' : 'front_yard';
    activateStreamMode(nextMode, 'front_yard');
    sendJsonOk(res, {
      backend: 'go2rtc',
      ui_state: buildUiStatePayload().ui_state,
    });
  });
});

app.get('/api/stop_streaming_and_turn_off_monitor', (req, res) => {
  stopMonitorTimer();
  stopStreamTimer();
  clearStreamState();

  turnMonitorOffCommand((error) => {
    monitor_on = false;
    if (error) {
      res.status(500).json({ Status: 'Error', Message: error.message });
      return;
    }

    sendJsonOk(res, { backend: 'go2rtc' });
  });
});

app.get('/api/stop_browser', (req, res) => {
  exec('pkill -f firefox', () => {
    sendJsonOk(res);
  });
});

app.get('/api/start_browser', (req, res) => {
  exec(`export DISPLAY=:0;firefox --kiosk=http://127.0.0.1:${port}/status/`, () => {
    sendJsonOk(res);
  });
});

app.get('/api/kill_stream_window', (req, res) => {
  stopStreamTimer();
  clearStreamState();
  sendJsonOk(res, { backend: 'go2rtc' });
});

app.post('/api/switch_stream_camera', (req, res) => {
  const mode =
    req.body && typeof req.body.mode === 'string' ? req.body.mode.trim() : '';
  if (!uiState.active) {
    res.status(400).json({ ok: false, message: 'Kein aktiver Stream' });
    return;
  }
  if (!uiState.ringSession) {
    res.status(403).json({ ok: false, message: 'Kamerawechsel nur nach Klingeln' });
    return;
  }
  if (
    !mode ||
    !appConfig.ui.streamModes ||
    !Object.prototype.hasOwnProperty.call(appConfig.ui.streamModes, mode)
  ) {
    res.status(400).json({ ok: false, message: 'Ungültiger Modus' });
    return;
  }
  activateStreamMode(mode, 'switch_camera');
  sendJsonOk(res, {
    backend: 'go2rtc',
    ui_state: buildUiStatePayload().ui_state,
  });
});

app.get('/api/open_stream_window', (req, res) => {
  if (stream) {
    res.status(200).json({ Status: 'Already Running' });
    return;
  }

  ensureMonitorOn(res, () => {
    activateStreamMode('main', 'open_stream_window');
    sendJsonOk(res, { backend: 'go2rtc' });
  });
});

app.get('/api/open_stream_window_front_yard', (req, res) => {
  if (stream) {
    res.status(200).json({ Status: 'Already Running' });
    return;
  }

  ensureMonitorOn(res, () => {
    activateStreamMode('front_yard', 'open_stream_window_front_yard');
    sendJsonOk(res, { backend: 'go2rtc' });
  });
});

// Layout-Debug: aktiviert ui_state und leitet zur Stream-Seite (ohne ensureMonitorOn).
app.get('/api/preview_stream_ui', (req, res) => {
  const raw = typeof req.query.mode === 'string' ? req.query.mode.trim() : '';
  const mode =
    raw === 'front_yard' || raw === 'front_yard_after_ring' ? raw : 'main';
  activateStreamMode(mode, 'debug_preview');
  res.redirect(302, appConfig.ui.streamPath || '/status/stream.html');
});

app.get('/api/switch_backend/:backend', (req, res) => {
  res.status(200).json({
    Status: 'Info',
    Message: 'Dieses System verwendet jetzt go2rtc als einziges Stream-Backend.',
    CurrentBackend: 'go2rtc',
    RequestedBackend: req.params.backend,
  });
});

app.get('/api/monitor_on', (req, res) => {
  console.log(`[MONITOR_ON] Called at ${new Date().toISOString()}, monitor_on=${monitor_on}`);
  ensureMonitorOn(res, () => {
    sendJsonOk(res, {
      backend: 'go2rtc',
      ui_state: buildUiStatePayload().ui_state,
    });
  });
});

app.get('/api/monitor_off', (req, res) => {
  stopMonitorTimer();
  stopStreamTimer();
  clearStreamState();

  turnMonitorOffCommand((error) => {
    monitor_on = false;
    if (error) {
      res.status(500).json({
        Status: 'MonitorOffFailed',
        Message: error.message,
        software_monitor_on: monitor_on,
      });
      return;
    }

    sendJsonOk(res, { backend: 'go2rtc' });
  });
});

app.get('/api/focus_browser', (req, res) => {
  exec('wmctrl -a firefox', () => {
    sendJsonOk(res);
  });
});

app.get('/api/debug', async (req, res) => {
  const [monitorStatus, go2rtcStatus, firefoxStatus] = await Promise.all([
    getMonitorStatus(),
    getGo2RtcStatus(),
    runCommand('pgrep firefox'),
  ]);

  const currentTime = Date.now();
  const timerRuntime = timer_start_time ? currentTime - timer_start_time : null;
  const streamRuntime = timer_stream_start_time ? currentTime - timer_stream_start_time : null;

  res.status(200).json({
    timestamp: new Date().toISOString(),
    status: 'OK',
    configuration: {
      backend: 'go2rtc',
      appConfigPath: fs.existsSync(APP_CONFIG_PATH) ? APP_CONFIG_PATH : APP_CONFIG_EXAMPLE_PATH,
      go2rtcConfigExamplePath: GO2RTC_CONFIG_EXAMPLE_PATH,
    },
    variables: {
      monitor_on,
      stream,
      stream_front_door,
      isChangingMonitor,
    },
    ui_state: buildUiStatePayload().ui_state,
    timer_status: {
      monitor_timer: {
        is_running: timer !== null && timer_start_time !== null,
        started_at: timer_start_time ? new Date(timer_start_time).toISOString() : null,
        runtime_ms: timerRuntime,
        time_until_trigger_ms: timerRuntime ? Math.max(0, MONITOR_TIMEOUT_MS - timerRuntime) : null,
      },
      stream_timer: {
        is_running: timer_stream !== null && timer_stream_start_time !== null,
        started_at: timer_stream_start_time
          ? new Date(timer_stream_start_time).toISOString()
          : null,
        runtime_ms: streamRuntime,
        time_until_trigger_ms: streamRuntime ? Math.max(0, STREAM_TIMEOUT_MS - streamRuntime) : null,
      },
    },
    system_status: {
      actual_monitor_status: monitorStatus.actualMonitorStatus,
      firefox_running: firefoxStatus.ok,
      firefox_pids: firefoxStatus.ok ? firefoxStatus.stdout.trim().split('\n').filter(Boolean) : [],
      go2rtc: go2rtcStatus,
    },
    monitor_details: {
      command_used: `${wlrRandrEnvPrefix()} wlr-randr --output HDMI-A-1`,
      wlr_randr_output: monitorStatus.rawOutput,
    },
  });
});

app.get('/api/debug/sync_monitor', async (req, res) => {
  const monitorStatus = await getMonitorStatus();
  const previousMonitorFlag = monitor_on;

  if (monitorStatus.actualMonitorStatus === 'on') {
    monitor_on = true;
  } else if (monitorStatus.actualMonitorStatus === 'off') {
    monitor_on = false;
  }

  if (monitor_on) {
    resetMonitorTimer();
  } else {
    stopMonitorTimer();
  }

  res.status(200).json({
    status: 'OK',
    before: previousMonitorFlag,
    after: monitor_on,
    actual_monitor_status: monitorStatus.actualMonitorStatus,
  });
});

app.get('/api/debug/hard_monitor_reset', async (req, res) => {
  const debugLog = [];
  debugLog.push(`[${new Date().toISOString()}] Starte Hard Monitor Reset`);

  const offResult = await runCommand(
    `${wlrRandrEnvPrefix()} wlr-randr --output HDMI-A-1 --off`
  );
  debugLog.push(
    `[${new Date().toISOString()}] Monitor OFF: ${offResult.ok ? 'OK' : offResult.error}`
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });

  const onResult = await runCommand(
    `${wlrRandrEnvPrefix()} wlr-randr --output HDMI-A-1 --on`
  );
  debugLog.push(
    `[${new Date().toISOString()}] Monitor ON: ${onResult.ok ? 'OK' : onResult.error}`
  );

  const monitorStatus = await getMonitorStatus();
  monitor_on = monitorStatus.actualMonitorStatus === 'on';
  if (monitor_on) {
    resetMonitorTimer();
  }

  res.status(200).json({
    status: monitor_on ? 'SUCCESS' : 'FAILED',
    backend: 'go2rtc',
    hardware_status: monitorStatus.actualMonitorStatus,
    debug_log: debugLog,
  });
});

app.get('/api/debug/wayland_env', async (req, res) => {
  const base = `XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR_WLR}"`;
  const wayland0 = await runCommand(`${base} WAYLAND_DISPLAY="wayland-0" wlr-randr --help`);
  const wayland1 = await runCommand(`${base} WAYLAND_DISPLAY="wayland-1" wlr-randr --help`);
  const sway = await runCommand('ps aux | grep sway | grep -v grep');

  res.status(200).json({
    timestamp: new Date().toISOString(),
    status: 'OK',
    backend: 'go2rtc',
    wayland_tests: {
      'wayland-0': wayland0.ok,
      'wayland-1': wayland1.ok,
      'wayland-0_error': wayland0.error,
      'wayland-1_error': wayland1.error,
    },
    system_info: {
      sway_running: sway.ok,
      sway_processes: sway.stdout || 'none',
    },
  });
});

app.get('/api/debug/fix_wayland', async (req, res) => {
  const debugLog = [];
  const wl = (n) =>
    `XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR_WLR}" WAYLAND_DISPLAY="wayland-${n}" wlr-randr`;
  const wayland0 = await runCommand(wl(0));
  debugLog.push(`Test wayland-0: ${wayland0.ok ? 'OK' : wayland0.error}`);

  if (wayland0.ok && wayland0.stdout.includes('HDMI-A-1')) {
    res.status(200).json({
      status: 'SUCCESS',
      backend: 'go2rtc',
      working_display: 'wayland-0',
      recommended_change:
        'Per Umgebungsvariable WAYLAND_DISPLAY=wayland-0 setzen (ist jetzt der Standard).',
      debug_log: debugLog,
    });
    return;
  }

  const wayland1 = await runCommand(wl(1));
  debugLog.push(`Test wayland-1: ${wayland1.ok ? 'OK' : wayland1.error}`);

  if (wayland1.ok && wayland1.stdout.includes('HDMI-A-1')) {
    res.status(200).json({
      status: 'NO_CHANGE_NEEDED',
      backend: 'go2rtc',
      working_display: 'wayland-1',
      recommended_change: 'Aktueller wayland-1 funktioniert.',
      debug_log: debugLog,
    });
    return;
  }

  res.status(500).json({
    status: 'NO_WORKING_DISPLAY',
    backend: 'go2rtc',
    working_display: null,
    recommended_change: 'Kein funktionsfähiges Wayland-Display gefunden.',
    debug_log: debugLog,
  });
});

app.get('/api/debug/auto_fix_timer', (req, res) => {
  const fixes = [];

  if (monitor_on && (timer === null || timer_start_time === null)) {
    resetMonitorTimer();
    fixes.push('Monitor Auto-OFF Timer gestartet');
  }

  if (uiState.active && (timer_stream === null || timer_stream_start_time === null)) {
    resetStreamTimer();
    fixes.push('Stream Auto-Stop Timer gestartet');
  }

  if (!monitor_on && timer !== null) {
    stopMonitorTimer();
    fixes.push('Überflüssigen Monitor-Timer gestoppt');
  }

  if (!uiState.active && timer_stream !== null) {
    stopStreamTimer();
    fixes.push('Überflüssigen Stream-Timer gestoppt');
  }

  res.status(200).json({
    timestamp: new Date().toISOString(),
    status: fixes.length > 0 ? 'FIXED' : 'NO_FIX_NEEDED',
    backend: 'go2rtc',
    fixes_applied: fixes,
  });
});

app.get('/api/debug/auto_fix_consistency', async (req, res) => {
  const monitorStatus = await getMonitorStatus();

  if (monitorStatus.actualMonitorStatus === 'off' && monitor_on) {
    monitor_on = false;
    stopMonitorTimer();
    stopStreamTimer();
    clearStreamState();
    res.status(200).json({
      status: 'CRITICAL_FIXED',
      backend: 'go2rtc',
      current_state: { software_monitor_on: monitor_on, hardware_status: 'off' },
    });
    return;
  }

  if (monitorStatus.actualMonitorStatus === 'on' && !monitor_on) {
    monitor_on = true;
    resetMonitorTimer();
    res.status(200).json({
      status: 'MINOR_FIXED',
      backend: 'go2rtc',
      current_state: { software_monitor_on: monitor_on, hardware_status: 'on' },
    });
    return;
  }

  res.status(200).json({
    status: 'NO_FIX_NEEDED',
    backend: 'go2rtc',
    current_state: {
      software_monitor_on: monitor_on,
      hardware_status: monitorStatus.actualMonitorStatus,
    },
  });
});

setTimeout(() => {
  exec(`firefox --kiosk=http://127.0.0.1:${port}/status/`, () => {});
}, 10000);

setTimeout(() => {
  turnMonitorOffCommand(() => {
    monitor_on = false;
  });
}, 30000);

function exit() {
  console.log('Exiting');
  process.exit();
}

process.on('SIGINT', exit);
