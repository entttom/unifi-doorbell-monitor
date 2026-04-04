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
const MONITOR_TIMEOUT_MS = 300000;
const STREAM_TIMEOUT_MS = 300000;

const STATUS_DIR = path.join(__dirname, 'status-dashboard');
const CONFIG_DIR = path.join(__dirname, 'config');
const CALENDAR_URL_PATH = path.join(CONFIG_DIR, 'calendar-url.txt');
const APP_CONFIG_PATH = path.join(CONFIG_DIR, 'app-config.json');
const APP_CONFIG_EXAMPLE_PATH = path.join(CONFIG_DIR, 'app-config.example.json');
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
        title: 'Haustuer',
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
      label: 'Gartentor oeffnen',
      method: 'GET',
      url: 'http://192.168.1.2:8087/set/openknx.0.Verbraucher.Garten_Garage.Gartentuere(Schalten)?value=true',
    },
    {
      id: 'open-door',
      label: 'Eingangstuere oeffnen',
      method: 'GET',
      url: 'http://192.168.1.2:8087/set/openknx.0.Verbraucher.Erdgeschoss.1_Vorraum-Tueroeffner(Schalten)?value=true',
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
      if (headerName.toLowerCase() === 'host') {
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
      loadedConfig && Array.isArray(loadedConfig.actions) && loadedConfig.actions.length > 0
        ? loadedConfig.actions
        : DEFAULT_APP_CONFIG.actions,
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
  uiState = {
    active: true,
    mode,
    streamKey: modeConfig.streamKey,
    title: modeConfig.title,
    showActions: Boolean(modeConfig.showActions),
    source,
    activatedAt,
    endsAt: activatedAt + STREAM_TIMEOUT_MS,
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

function buildUiStatePayload() {
  return {
    backend: 'go2rtc',
    dashboardPath: appConfig.ui.dashboardPath,
    streamPath: appConfig.ui.streamPath,
    pollIntervalMs: appConfig.ui.pollIntervalMs,
    monitor_on,
    stream,
    stream_front_door,
    ui_state: {
      ...uiState,
      playerUrl: uiState.streamKey ? getPlayerUrl(uiState.streamKey) : null,
      actions: uiState.active && uiState.showActions ? getConfiguredActions() : [],
    },
  };
}

function turnMonitorOnCommand(callback) {
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', callback);
}

function turnMonitorOffCommand(callback) {
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', callback);
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
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (error, stdout) => {
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

function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
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
      command_used: 'WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1',
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
    'WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off'
  );
  debugLog.push(
    `[${new Date().toISOString()}] Monitor OFF: ${offResult.ok ? 'OK' : offResult.error}`
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });

  const onResult = await runCommand(
    'WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on'
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
  const wayland0 = await runCommand('WAYLAND_DISPLAY="wayland-0" wlr-randr --help');
  const wayland1 = await runCommand('WAYLAND_DISPLAY="wayland-1" wlr-randr --help');
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
  const wayland0 = await runCommand('WAYLAND_DISPLAY="wayland-0" wlr-randr');
  debugLog.push(`Test wayland-0: ${wayland0.ok ? 'OK' : wayland0.error}`);

  if (wayland0.ok && wayland0.stdout.includes('HDMI-A-1')) {
    res.status(200).json({
      status: 'SUCCESS',
      backend: 'go2rtc',
      working_display: 'wayland-0',
      recommended_change: 'Aendere die Monitor-Kommandos dauerhaft auf wayland-0.',
      debug_log: debugLog,
    });
    return;
  }

  const wayland1 = await runCommand('WAYLAND_DISPLAY="wayland-1" wlr-randr');
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
    recommended_change: 'Kein funktionsfaehiges Wayland-Display gefunden.',
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
    fixes.push('Ueberfluessigen Monitor-Timer gestoppt');
  }

  if (!uiState.active && timer_stream !== null) {
    stopStreamTimer();
    fixes.push('Ueberfluessigen Stream-Timer gestoppt');
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
