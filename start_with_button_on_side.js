const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { exec } = require('node:child_process')
//var Gpio = require('onoff').Gpio;
//var pir = new Gpio(417,'in','both'); // Find right PIN "cat /sys/kernel/debug/gpio" PIN12 is named 417 for whatever reason 

var monitor_on = true;
var stream = false;
var stream_front_door = false;
let isChangingMonitor = false;


app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//Timer for Monitor off and kill streams
let timer;
let timer_start_time = null;
const runTimer = () => {
  timer_start_time = Date.now();
  timer = setTimeout(() => {
    console.log(`[TIMER] Auto-OFF ausgelöst um ${new Date().toISOString()}`);
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {
      if (error) {
        console.error(`[TIMER] Monitor OFF fehlgeschlagen:`, error.message);
      } else {
        console.log(`[TIMER] Monitor OFF erfolgreich`);
      }
      // monitor_on wird IMMER auf false gesetzt, auch bei Fehler
      monitor_on = false;
    });
    
    exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    
    stream = false;
    stream_front_door = false;
    timer_start_time = null; // Reset when timer expires
    
  }, "300000"); //Screen auto of after 5 min
};

//Timer for kill streams only
let timer_stream;
let timer_stream_start_time = null;
const runTimer_stream = () => {
  timer_stream_start_time = Date.now();
  timer_stream = setTimeout(() => {
    exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream

    stream = false;
    stream_front_door = false;
    timer_stream_start_time = null; // Reset when timer expires
    
  }, "300000"); //Screen auto of after 5 min
};

setTimeout(() => {
exec('firefox --kiosk=http://192.168.1.48', (error, stdout, stderr) => {if (error) {return;}}); // Start Firefox 
}, "10000"); 


setTimeout(() => {
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5 after Start
  monitor_on = false;
}, "30000"); 

// Add the edge detection callback to catch the motion detection events
// var armed = false;
/*
pir.watch(function(err, value) {
  if (value === 1) {
    if (armed == false) {
    // The pin went high - motion detected
    console.log("Motion Detected: %d", value);
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi5
    armed = true;
    setTimeout(() => { armed = false}, "60000"); 
      }
    clearTimeout(timer);
    runTimer();
  }
});
*/

app.get('/api/ring_ring', (req, res) => {
  //exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi3
  console.log(`[RING_RING] Called at ${new Date().toISOString()}, monitor_on=${monitor_on}`);
  
  if(monitor_on == false) {  
    console.log(`[RING_RING] Monitor ist OFF, versuche einzuschalten...`);
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error) => {
      if (error) {
        console.error(`[RING_RING] Monitor ON fehlgeschlagen:`, error.message);
        console.error(`[RING_RING] stderr:`, error.stderr || 'Kein stderr');
        console.error(`[RING_RING] stdout:`, error.stdout || 'Kein stdout');
        monitor_on = false;
        return;
      }
      console.log(`[RING_RING] Monitor ON Befehl erfolgreich ausgeführt`);
      monitor_on = true;
      
      // Verifikation nach 1 Sekunde
      setTimeout(() => {
        exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (verifyError, verifyStdout) => {
          if (!verifyError && verifyStdout) {
            const isActuallyOn = verifyStdout.includes('HDMI-A-1') && verifyStdout.includes('Enabled: yes');
            console.log(`[RING_RING] Monitor-Verifikation: tatsächlich ${isActuallyOn ? 'ON' : 'OFF'}`);
            if (!isActuallyOn) {
              console.error(`[RING_RING] CRITICAL: Monitor-Befehl war erfolgreich, aber Hardware ist immer noch OFF!`);
            }
          }
        });
      }, 1000);
    });

    setTimeout(() => {
      if(stream == false) { 
        console.log(`[RING_RING] Starte Stream nach 2s Delay...`);
        exec('python stream.py', (error, stdout, stderr) => {
          if (error) {
            console.error(`[RING_RING] Stream start fehlgeschlagen:`, error.message);
          } else {
            console.log(`[RING_RING] Stream erfolgreich gestartet`);
          }
        }); 
        stream = true;
        stream_front_door = true;
      };
    }, "2000"); 
    }
    if(monitor_on == true) {
      console.log(`[RING_RING] Monitor ist bereits ON, starte Stream...`);
      exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
      exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
      exec('python stream.py', (error, stdout, stderr) => {
        if (error) {
          console.error(`[RING_RING] Stream start fehlgeschlagen (Monitor bereits ON):`, error.message);
        }
      }); 
      stream = true;
      stream_front_door = true;
    };
  
    clearTimeout(timer);
    timer_start_time = null;
    runTimer();
    clearTimeout(timer_stream);
    timer_stream_start_time = null;
    runTimer_stream();
    console.log(`[RING_RING] Abgeschlossen, monitor_on=${monitor_on}, stream=${stream}`);
    res.status(200).json( { Status: 'OK'}); 
});

app.get('/api/front_yard', (req, res) => {
  //exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi3
  
  if(monitor_on == false) {  
exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error) => {
  if (error) {
    console.error("Monitor ON failed:", error.message);
    monitor_on = false;
    return;
  }
  monitor_on = true;
});
  setTimeout(() => {
  if(stream == false) { 
      exec('python stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); 
      stream = true;
    };
  }, "2000"); 
  }

  if(monitor_on == true && stream == false) {
    exec('python stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); 
    stream = true;
  };

  if(monitor_on == true && stream_front_door == true) {
    exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
    setTimeout(() => {
      exec('python stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); 
    }, "100"); 
    stream = true;
    stream_front_door = false;
  };

  clearTimeout(timer);
  timer_start_time = null;
  runTimer();
  clearTimeout(timer_stream);
  timer_stream_start_time = null;
  runTimer_stream();
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/stop_streaming_and_turn_off_monitor', (req, res) => {
  // Timer stoppen
  clearTimeout(timer);
  timer_start_time = null;
  clearTimeout(timer_stream);
  timer_stream_start_time = null;

  exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
  exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
  exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream

  //exec('export DISPLAY=:0;xset q;xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi3
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5 
  monitor_on = false;
  stream = false;
  stream_front_door = false;
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/stop_browser', (req, res) => {
  exec('pkill -f firefox', (error, stdout, stderr) => {if (error) {return;}}); 
  res.status(200).json( { Status: 'OK'});  
  });

app.get('/api/start_browser', (req, res) => {
  exec('export DISPLAY=:0;firefox --kiosk=http://192.168.1.48', (error, stdout, stderr) => {if (error) {return;}}); 
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/kill_stream_window', (req, res) => {
  exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}});
  exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
  exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream

  stream = false;
  stream_front_door = false;
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/open_stream_window', (req, res) => {
  stream = true;
  stream_front_door = true;
  exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/open_stream_window_front_yard', (req, res) => {
  stream = true;
  exec('python stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); 
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/monitor_on', (req, res) => {
  console.log(`[MONITOR_ON] Called at ${new Date().toISOString()}, monitor_on=${monitor_on}, isChangingMonitor=${isChangingMonitor}`);
  
  if (isChangingMonitor) {
    console.log(`[MONITOR_ON] Monitor-Änderung bereits in Bearbeitung`);
    return res.status(200).json({ Status: 'AlreadyPending' });
  }

  if (monitor_on) {
    console.log(`[MONITOR_ON] Monitor ist bereits ON laut Software-Status`);
    
    // WICHTIG: Timer zurücksetzen da Monitor-Aktivität erkannt
    clearTimeout(timer);
    timer_start_time = null;
    runTimer();
    console.log(`[MONITOR_ON] Monitor Auto-OFF Timer zurückgesetzt (Monitor bereits an)`);
    
    // Trotzdem kurz verifizieren ob Hardware auch wirklich an ist
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (verifyError, verifyStdout) => {
      if (!verifyError && verifyStdout) {
        const isActuallyOn = verifyStdout.includes('HDMI-A-1') && verifyStdout.includes('Enabled: yes');
        console.log(`[MONITOR_ON] Hardware-Verifikation: tatsächlich ${isActuallyOn ? 'ON' : 'OFF'}`);
        if (!isActuallyOn) {
          console.log(`[MONITOR_ON] Hardware ist OFF trotz Software-Status ON - führe Einschaltung durch`);
          performMonitorOn(res);
        } else {
          return res.status(200).json({ Status: 'AlreadyOn', TimerReset: true });
        }
      } else {
        return res.status(200).json({ Status: 'AlreadyOn', TimerReset: true });
      }
    });
    return;
  }

  performMonitorOn(res);

  function performMonitorOn(response) {
    isChangingMonitor = true;
    console.log(`[MONITOR_ON] Monitor ist OFF, versuche einzuschalten...`);
    
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error) => {
      if (error) {
        console.error(`[MONITOR_ON] Monitor ON fehlgeschlagen:`, error.message);
        console.error(`[MONITOR_ON] stderr:`, error.stderr || 'Kein stderr');
        console.error(`[MONITOR_ON] stdout:`, error.stdout || 'Kein stdout');
        isChangingMonitor = false;
        monitor_on = false;
        return response.status(500).json({ Status: 'Error', Message: error.message });
      }
      
      console.log(`[MONITOR_ON] Monitor ON Befehl erfolgreich ausgeführt`);
      monitor_on = true;
      
      // Verifikation nach 1 Sekunde
      setTimeout(() => {
        exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (verifyError, verifyStdout) => {
          if (!verifyError && verifyStdout) {
            const isActuallyOn = verifyStdout.includes('HDMI-A-1') && verifyStdout.includes('Enabled: yes');
            console.log(`[MONITOR_ON] Monitor-Verifikation: tatsächlich ${isActuallyOn ? 'ON' : 'OFF'}`);
            
            if (!isActuallyOn) {
              console.error(`[MONITOR_ON] CRITICAL: Monitor-Befehl war erfolgreich, aber Hardware ist immer noch OFF!`);
              console.log(`[MONITOR_ON] Starte Retry-Versuch...`);
              
              // Retry-Versuch
              setTimeout(() => {
                exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (retryError) => {
                  if (retryError) {
                    console.error(`[MONITOR_ON] Retry fehlgeschlagen:`, retryError.message);
                    isChangingMonitor = false;
                    monitor_on = false;
                    return response.status(500).json({ Status: 'RetryFailed', Message: retryError.message });
                  }
                  
                  console.log(`[MONITOR_ON] Retry-Befehl ausgeführt`);
                  
                  // Finale Verifikation nach Retry
                  setTimeout(() => {
                    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (finalVerifyError, finalVerifyStdout) => {
                      isChangingMonitor = false;
                      
                      if (!finalVerifyError && finalVerifyStdout) {
                        const isFinallyOn = finalVerifyStdout.includes('HDMI-A-1') && finalVerifyStdout.includes('Enabled: yes');
                        console.log(`[MONITOR_ON] Finale Verifikation: tatsächlich ${isFinallyOn ? 'ON' : 'OFF'}`);
                        
                        if (isFinallyOn) {
                          monitor_on = true;
                          console.log(`[MONITOR_ON] Erfolgreich nach Retry!`);
                          
                          // Monitor Auto-OFF Timer starten da Monitor jetzt an ist (nach Retry)
                          clearTimeout(timer);
                          timer_start_time = null;
                          runTimer();
                          console.log(`[MONITOR_ON] Monitor Auto-OFF Timer gestartet (nach Retry)`);
                          
                          return response.status(200).json({ Status: 'OK', Message: 'Success after retry' });
                        } else {
                          monitor_on = false;
                          console.error(`[MONITOR_ON] FAILED: Auch nach Retry ist Hardware OFF!`);
                          return response.status(500).json({ Status: 'HardwareFailed', Message: 'Monitor bleibt OFF auch nach Retry' });
                        }
                      } else {
                        console.error(`[MONITOR_ON] Finale Verifikation fehlgeschlagen`);
                        return response.status(500).json({ Status: 'VerificationFailed' });
                      }
                    });
                  }, 1000);
                });
              }, 1000);
            } else {
              // Alles OK beim ersten Versuch
              isChangingMonitor = false;
              console.log(`[MONITOR_ON] Erfolgreich beim ersten Versuch!`);
              
              // Monitor Auto-OFF Timer starten da Monitor jetzt an ist
              clearTimeout(timer);
              timer_start_time = null;
              runTimer();
              console.log(`[MONITOR_ON] Monitor Auto-OFF Timer gestartet`);
              
              return response.status(200).json({ Status: 'OK' });
            }
          } else {
            isChangingMonitor = false;
            console.error(`[MONITOR_ON] Verifikation fehlgeschlagen`);
            return response.status(500).json({ Status: 'VerificationError' });
          }
        });
      }, 1000);
    });
  }
});

app.get('/api/monitor_off', (req, res) => {
  console.log(`[MONITOR_OFF] Called at ${new Date().toISOString()}, monitor_on=${monitor_on}`);
  
  // Timer stoppen
  clearTimeout(timer);
  timer_start_time = null;
  clearTimeout(timer_stream);
  timer_stream_start_time = null;

  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error) => {
    if (error) {
      console.error(`[MONITOR_OFF] Monitor OFF fehlgeschlagen:`, error.message);
      // Trotzdem monitor_on auf false setzen - Software folgt Hardware-Intention
      monitor_on = false;
      console.log(`[MONITOR_OFF] monitor_on auf false gesetzt trotz Fehler`);
      return res.status(500).json({ 
        Status: 'MonitorOffFailed', 
        Message: error.message,
        software_monitor_on: monitor_on 
      });
    }
    
    console.log(`[MONITOR_OFF] Monitor OFF erfolgreich`);
    monitor_on = false;

    // Jetzt auch die Streams beenden
    exec('pkill -f stream.py');
    exec('pkill -f stream_front_yard.py');
    exec('pkill -f stream_front_yard_after_ring.py');
    stream = false;
    stream_front_door = false;

    console.log(`[MONITOR_OFF] Abgeschlossen, monitor_on=${monitor_on}`);
    return res.status(200).json({ Status: 'OK' });
  });
});


app.get('/api/focus_browser', (req, res) => {
    exec('wmctrl -a firefox', (error, stdout, stderr) => {if (error) {return;}}); 
    res.status(200).json( { Status: 'OK'});  
});  

app.get('/api/debug', (req, res) => {
  // Prüfe den tatsächlichen Monitor-Status
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (error, stdout, stderr) => {
    let actualMonitorStatus = 'unknown';
    let monitorInfo = '';
    
    if (!error && stdout) {
      monitorInfo = stdout;
      // Suche nach dem HDMI-A-1 Output und seinem Status
      const hdmiMatch = stdout.match(/HDMI-A-1[\s\S]*?(?=\n\w|$)/);
      if (hdmiMatch) {
        actualMonitorStatus = hdmiMatch[0].includes('Enabled: yes') ? 'on' : 'off';
      }
    }

    // Prüfe laufende Stream-Prozesse
    exec('ps aux | grep -E "(stream\\.py|stream_front_yard|firefox)" | grep -v grep', (psError, psStdout, psStderr) => {
      let runningProcesses = [];
      if (!psError && psStdout) {
        runningProcesses = psStdout.split('\n').filter(line => line.trim()).map(line => {
          const parts = line.split(/\s+/);
          return {
            pid: parts[1],
            command: parts.slice(10).join(' ').substring(0, 100) // Begrenzt auf 100 Zeichen
          };
        });
      }

      // Prüfe ob Firefox läuft
      exec('pgrep firefox', (firefoxError, firefoxStdout) => {
        const firefoxRunning = !firefoxError && firefoxStdout.trim();
        
        // Timer-Laufzeit berechnen
        const currentTime = Date.now();
        const timerRuntime = timer_start_time ? currentTime - timer_start_time : null;
        const timerStreamRuntime = timer_stream_start_time ? currentTime - timer_stream_start_time : null;

        // Sammle erweiterte Debug-Informationen
        const debugInfo = {
          timestamp: new Date().toISOString(),
          status: 'OK',
          variables: {
            monitor_on: monitor_on,
            stream: stream,
            stream_front_door: stream_front_door,
            isChangingMonitor: isChangingMonitor
          },
          timer_status: {
            monitor_timer: {
              is_running: timer !== null && timer_start_time !== null,
              started_at: timer_start_time ? new Date(timer_start_time).toISOString() : null,
              runtime_ms: timerRuntime,
              runtime_seconds: timerRuntime ? Math.round(timerRuntime / 1000) : null,
              time_until_trigger_ms: timerRuntime ? (300000 - timerRuntime) : null,
              time_until_trigger_seconds: timerRuntime ? Math.round((300000 - timerRuntime) / 1000) : null,
              timeout_duration_ms: 300000
            },
            stream_timer: {
              is_running: timer_stream !== null && timer_stream_start_time !== null,
              started_at: timer_stream_start_time ? new Date(timer_stream_start_time).toISOString() : null,
              runtime_ms: timerStreamRuntime,
              runtime_seconds: timerStreamRuntime ? Math.round(timerStreamRuntime / 1000) : null,
              time_until_trigger_ms: timerStreamRuntime ? (300000 - timerStreamRuntime) : null,
              time_until_trigger_seconds: timerStreamRuntime ? Math.round((300000 - timerStreamRuntime) / 1000) : null,
              timeout_duration_ms: 300000
            }
          },
          system_status: {
            actual_monitor_status: actualMonitorStatus,
            firefox_running: !!firefoxRunning,
            firefox_pids: firefoxRunning ? firefoxStdout.trim().split('\n') : []
          },
          running_processes: runningProcesses,
          monitor_details: {
            command_used: 'WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1',
            last_monitor_command_error: error ? error.message : null,
            wlr_randr_output: monitorInfo || 'No output'
          },
          potential_issues: []
        };

        // Erkenne potentielle Probleme
        if (monitor_on === true && actualMonitorStatus === 'off') {
          debugInfo.potential_issues.push('CRITICAL: monitor_on=true aber tatsächlicher Monitor-Status ist OFF');
        }
        
        if (monitor_on === false && actualMonitorStatus === 'on') {
          debugInfo.potential_issues.push('WARNING: monitor_on=false aber tatsächlicher Monitor-Status ist ON');
        }

        if (stream === true && runningProcesses.filter(p => p.command.includes('stream')).length === 0) {
          debugInfo.potential_issues.push('WARNING: stream=true aber keine Stream-Prozesse laufen');
        }

        if (isChangingMonitor === true) {
          debugInfo.potential_issues.push('INFO: Monitor-Status wird gerade geändert');
        }

        // Timer-bezogene Probleme erkennen
        if (debugInfo.timer_status.monitor_timer.is_running && debugInfo.timer_status.monitor_timer.time_until_trigger_seconds < 30) {
          debugInfo.potential_issues.push(`WARNING: Monitor wird in ${debugInfo.timer_status.monitor_timer.time_until_trigger_seconds} Sekunden automatisch ausgeschaltet`);
        }

        if (debugInfo.timer_status.stream_timer.is_running && debugInfo.timer_status.stream_timer.time_until_trigger_seconds < 30) {
          debugInfo.potential_issues.push(`WARNING: Streams werden in ${debugInfo.timer_status.stream_timer.time_until_trigger_seconds} Sekunden automatisch beendet`);
        }

        if (!debugInfo.timer_status.monitor_timer.is_running && monitor_on === true) {
          debugInfo.potential_issues.push('WARNING: Monitor ist AN aber kein Auto-OFF Timer läuft - verwende /api/debug/auto_fix_timer');
        }

        if (!debugInfo.timer_status.stream_timer.is_running && (stream === true || stream_front_door === true)) {
          debugInfo.potential_issues.push('WARNING: Streams laufen aber kein Auto-Stop Timer ist aktiv - verwende /api/debug/auto_fix_timer');
        }

        // Zusätzliche kritische Konsistenz-Prüfungen
        if (monitor_on === true && actualMonitorStatus === 'off') {
          debugInfo.potential_issues.push('CRITICAL: Inkonsistenz erkannt! Software denkt Monitor ist AN, aber Hardware ist AUS. Möglicherweise fehlgeschlagener Monitor-Befehl.');
        }

        if (monitor_on === false && actualMonitorStatus === 'on') {
          debugInfo.potential_issues.push('WARNING: Software denkt Monitor ist AUS, aber Hardware ist AN. Möglicherweise externer Eingriff.');
        }

        res.status(200).json(debugInfo);
      });
    });
  });
});  

// Neuer Debug-Endpoint um Monitor-Status zu synchronisieren
app.get('/api/debug/sync_monitor', (req, res) => {
  const startTime = Date.now();
  const debugLog = [];
  
  debugLog.push(`[${new Date().toISOString()}] Starte Monitor-Synchronisation`);
  debugLog.push(`[${new Date().toISOString()}] Aktueller monitor_on Status: ${monitor_on}`);
  
  // Prüfe aktuellen Hardware-Status
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (error, stdout, stderr) => {
    debugLog.push(`[${new Date().toISOString()}] wlr-randr Befehl ausgeführt`);
    
    if (error) {
      debugLog.push(`[${new Date().toISOString()}] ERROR: wlr-randr fehlgeschlagen: ${error.message}`);
      return res.status(500).json({
        status: 'ERROR',
        message: 'Konnte Monitor-Status nicht prüfen',
        debug_log: debugLog,
        duration_ms: Date.now() - startTime
      });
    }
    
    let actualMonitorStatus = 'unknown';
    const hdmiMatch = stdout.match(/HDMI-A-1[\s\S]*?(?=\n\w|$)/);
    
    if (hdmiMatch) {
      actualMonitorStatus = hdmiMatch[0].includes('Enabled: yes') ? 'on' : 'off';
      debugLog.push(`[${new Date().toISOString()}] Tatsächlicher Monitor-Status erkannt: ${actualMonitorStatus}`);
    } else {
      debugLog.push(`[${new Date().toISOString()}] WARNING: HDMI-A-1 nicht in wlr-randr Output gefunden`);
    }
    
    // Prüfe ob Synchronisation nötig ist
    const needsSync = (monitor_on && actualMonitorStatus === 'off') || (!monitor_on && actualMonitorStatus === 'on');
    
    if (needsSync) {
      debugLog.push(`[${new Date().toISOString()}] SYNC NEEDED: Software-Status (${monitor_on}) != Hardware-Status (${actualMonitorStatus})`);
      
      // Synchronisiere Software-Status mit Hardware-Status
      if (actualMonitorStatus === 'on') {
        monitor_on = true;
        debugLog.push(`[${new Date().toISOString()}] monitor_on auf true gesetzt (Hardware ist an)`);
      } else {
        monitor_on = false;
        debugLog.push(`[${new Date().toISOString()}] monitor_on auf false gesetzt (Hardware ist aus)`);
      }
    } else {
      debugLog.push(`[${new Date().toISOString()}] OK: Software-Status und Hardware-Status sind synchron`);
    }
    
    // Zusätzliche Prüfungen
    exec('ps aux | grep -E "stream.*\\.py" | grep -v grep', (psError, psStdout) => {
      const streamProcessCount = psStdout ? psStdout.split('\n').filter(line => line.trim()).length : 0;
      debugLog.push(`[${new Date().toISOString()}] Stream-Prozesse gefunden: ${streamProcessCount}`);
      
      const response = {
        status: needsSync ? 'SYNCHRONIZED' : 'OK',
        before_sync: {
          software_monitor_on: req.query.original_monitor_on ? JSON.parse(req.query.original_monitor_on) : 'unknown',
          hardware_monitor_status: actualMonitorStatus
        },
        after_sync: {
          software_monitor_on: monitor_on,
          hardware_monitor_status: actualMonitorStatus,
          sync_was_needed: needsSync
        },
        additional_info: {
          stream_processes_running: streamProcessCount,
          software_stream_flag: stream,
          isChangingMonitor: isChangingMonitor
        },
        debug_log: debugLog,
        duration_ms: Date.now() - startTime,
        full_wlr_output: stdout
      };
      
      res.status(200).json(response);
    });
  });
});

// Hard Monitor Reset für Debug-Zwecke
app.get('/api/debug/hard_monitor_reset', (req, res) => {
  const startTime = Date.now();
  const debugLog = [];
  
  debugLog.push(`[${new Date().toISOString()}] Starte harten Monitor-Reset`);
  debugLog.push(`[${new Date().toISOString()}] Vorher: monitor_on=${monitor_on}`);
  
  // Schritt 1: Monitor ausschalten
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (offError, offStdout, offStderr) => {
    debugLog.push(`[${new Date().toISOString()}] Schritt 1: Monitor OFF Befehl ausgeführt`);
    if (offError) {
      debugLog.push(`[${new Date().toISOString()}] ERROR beim Ausschalten: ${offError.message}`);
    } else {
      debugLog.push(`[${new Date().toISOString()}] Monitor OFF erfolgreich`);
    }
    // monitor_on wird IMMER auf false gesetzt bei Hard Reset
    monitor_on = false;
    debugLog.push(`[${new Date().toISOString()}] monitor_on auf false gesetzt`);
    
    // Warte 2 Sekunden
    setTimeout(() => {
      debugLog.push(`[${new Date().toISOString()}] Schritt 2: 2 Sekunden gewartet`);
      
      // Schritt 2: Monitor einschalten
      exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (onError, onStdout, onStderr) => {
        debugLog.push(`[${new Date().toISOString()}] Schritt 3: Monitor ON Befehl ausgeführt`);
        if (onError) {
          debugLog.push(`[${new Date().toISOString()}] ERROR beim Einschalten: ${onError.message}`);
          monitor_on = false;
        } else {
          debugLog.push(`[${new Date().toISOString()}] Monitor ON erfolgreich`);
          monitor_on = true;
        }
        
        // Schritt 3: Status verifizieren
        setTimeout(() => {
          exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (verifyError, verifyStdout) => {
            debugLog.push(`[${new Date().toISOString()}] Schritt 4: Status-Verifikation`);
            
            let actualStatus = 'unknown';
            if (!verifyError && verifyStdout) {
              const hdmiMatch = verifyStdout.match(/HDMI-A-1[\s\S]*?(?=\n\w|$)/);
              if (hdmiMatch) {
                actualStatus = hdmiMatch[0].includes('Enabled: yes') ? 'on' : 'off';
              }
            }
            
            debugLog.push(`[${new Date().toISOString()}] Verifikation: Hardware-Status = ${actualStatus}`);
            debugLog.push(`[${new Date().toISOString()}] Software monitor_on = ${monitor_on}`);
            
            const isSuccess = actualStatus === 'on' && monitor_on === true;
            debugLog.push(`[${new Date().toISOString()}] Reset ${isSuccess ? 'ERFOLGREICH' : 'FEHLGESCHLAGEN'}`);
            
            res.status(200).json({
              status: isSuccess ? 'SUCCESS' : 'FAILED',
              before_reset: {
                software_monitor_on: req.query.before_monitor_on || 'unknown'
              },
              after_reset: {
                software_monitor_on: monitor_on,
                hardware_status: actualStatus,
                is_synchronized: monitor_on === (actualStatus === 'on')
              },
              debug_log: debugLog,
              duration_ms: Date.now() - startTime,
              full_wlr_output: verifyStdout || 'No output'
            });
          });
        }, 1000);
      });
    }, 2000);
  });
});

// Debug Wayland Environment - Vereinfachte Version
app.get('/api/debug/wayland_env', (req, res) => {
  const startTime = Date.now();
  
  // Teste nur die wichtigsten WAYLAND_DISPLAY Werte schnell
  exec('WAYLAND_DISPLAY="wayland-0" wlr-randr --help', (error0, stdout0) => {
    const wayland0Works = !error0;
    
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --help', (error1, stdout1) => {
      const wayland1Works = !error1;
      
      exec('ps aux | grep sway | grep -v grep', (swayError, swayStdout) => {
        const swayRunning = !swayError && swayStdout && swayStdout.includes('sway');
        
        const result = {
          timestamp: new Date().toISOString(),
          status: 'OK',
          wayland_tests: {
            'wayland-0': wayland0Works,
            'wayland-1': wayland1Works,
            'wayland-0_error': error0 ? error0.message : null,
            'wayland-1_error': error1 ? error1.message : null
          },
          system_info: {
            sway_running: swayRunning,
            sway_processes: swayStdout || 'none'
          },
          recommendations: [],
          duration_ms: Date.now() - startTime
        };
        
        if (wayland0Works && !wayland1Works) {
          result.recommendations.push('Verwende WAYLAND_DISPLAY="wayland-0" statt "wayland-1"');
        } else if (!wayland0Works && !wayland1Works) {
          result.recommendations.push('CRITICAL: Kein WAYLAND_DISPLAY funktioniert!');
        }
        
        res.status(200).json(result);
      });
    });
  });
});

// Auto-Fix Wayland Display - Vereinfacht
app.get('/api/debug/fix_wayland', (req, res) => {
  const startTime = Date.now();
  const debugLog = [];
  
  debugLog.push(`Starte Wayland-Fix um ${new Date().toISOString()}`);
  
  // Teste wayland-0 zuerst
  exec('WAYLAND_DISPLAY="wayland-0" wlr-randr', (error0, stdout0) => {
    debugLog.push(`Test wayland-0: ${error0 ? 'FEHLGESCHLAGEN' : 'OK'}`);
    
    if (!error0 && stdout0 && stdout0.includes('HDMI-A-1')) {
      debugLog.push('wayland-0 funktioniert! Teste Monitor ON...');
      
      // Teste Monitor einschalten mit wayland-0
      exec('WAYLAND_DISPLAY="wayland-0" wlr-randr --output HDMI-A-1 --on', (onError) => {
        if (onError) {
          debugLog.push(`Monitor ON mit wayland-0 fehlgeschlagen: ${onError.message}`);
        } else {
          debugLog.push('Monitor ON mit wayland-0 erfolgreich!');
          monitor_on = true;
        }
        
        res.status(200).json({
          status: onError ? 'PARTIAL_SUCCESS' : 'SUCCESS',
          working_display: 'wayland-0',
          recommended_change: 'Ändere alle "wayland-1" zu "wayland-0" in der Datei',
          monitor_command_result: onError ? 'FAILED' : 'SUCCESS',
          debug_log: debugLog,
          duration_ms: Date.now() - startTime
        });
      });
    } else {
      // wayland-0 funktioniert nicht, teste wayland-1
      exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (error1, stdout1) => {
        debugLog.push(`Test wayland-1: ${error1 ? 'FEHLGESCHLAGEN' : 'OK'}`);
        
        if (!error1 && stdout1 && stdout1.includes('HDMI-A-1')) {
          debugLog.push('wayland-1 funktioniert bereits korrekt');
          res.status(200).json({
            status: 'NO_CHANGE_NEEDED',
            working_display: 'wayland-1',
            recommended_change: 'Aktueller wayland-1 funktioniert',
            debug_log: debugLog,
            duration_ms: Date.now() - startTime
          });
        } else {
          debugLog.push('Weder wayland-0 noch wayland-1 funktionieren!');
          res.status(500).json({
            status: 'NO_WORKING_DISPLAY',
            working_display: null,
            recommended_change: 'System-Problem: Kein Wayland-Display funktioniert',
            debug_log: debugLog,
            duration_ms: Date.now() - startTime,
            next_steps: ['Raspberry Pi neustarten', 'Sway/Wayland-Compositor prüfen']
          });
        }
      });
    }
  });
});

// Auto-Fix für fehlende Timer
app.get('/api/debug/auto_fix_timer', (req, res) => {
  const startTime = Date.now();
  const debugLog = [];
  
  debugLog.push(`[${new Date().toISOString()}] Starte Auto-Fix für fehlende Timer`);
  debugLog.push(`[${new Date().toISOString()}] Aktueller Status: monitor_on=${monitor_on}, stream=${stream}, stream_front_door=${stream_front_door}`);
  debugLog.push(`[${new Date().toISOString()}] Timer Status: monitor_timer=${timer !== null}, stream_timer=${timer_stream !== null}`);
  
  let fixes = [];
  
  // Fix 1: Monitor ist an aber kein Auto-OFF Timer
  if (monitor_on === true && (timer === null || timer_start_time === null)) {
    debugLog.push(`[${new Date().toISOString()}] FIXING: Monitor ist AN aber kein Auto-OFF Timer läuft`);
    clearTimeout(timer); // Sicherheitshalber
    timer_start_time = null;
    runTimer();
    fixes.push('Monitor Auto-OFF Timer gestartet (5 Minuten)');
    debugLog.push(`[${new Date().toISOString()}] Monitor Auto-OFF Timer gestartet`);
  }
  
  // Fix 2: Streams laufen aber kein Auto-Stop Timer
  if ((stream === true || stream_front_door === true) && (timer_stream === null || timer_stream_start_time === null)) {
    debugLog.push(`[${new Date().toISOString()}] FIXING: Streams laufen aber kein Auto-Stop Timer`);
    clearTimeout(timer_stream); // Sicherheitshalber
    timer_stream_start_time = null;
    runTimer_stream();
    fixes.push('Stream Auto-Stop Timer gestartet (5 Minuten)');
    debugLog.push(`[${new Date().toISOString()}] Stream Auto-Stop Timer gestartet`);
  }
  
  // Zusätzlicher Fix: Monitor aus aber Timer laufen noch
  if (monitor_on === false && (timer !== null && timer_start_time !== null)) {
    debugLog.push(`[${new Date().toISOString()}] FIXING: Monitor ist AUS aber Auto-OFF Timer läuft noch`);
    clearTimeout(timer);
    timer_start_time = null;
    fixes.push('Überflüssiger Monitor Auto-OFF Timer gestoppt');
    debugLog.push(`[${new Date().toISOString()}] Überflüssiger Monitor Timer gestoppt`);
  }
  
  if (stream === false && stream_front_door === false && (timer_stream !== null && timer_stream_start_time !== null)) {
    debugLog.push(`[${new Date().toISOString()}] FIXING: Keine Streams aber Auto-Stop Timer läuft noch`);
    clearTimeout(timer_stream);
    timer_stream_start_time = null;
    fixes.push('Überflüssiger Stream Auto-Stop Timer gestoppt');
    debugLog.push(`[${new Date().toISOString()}] Überflüssiger Stream Timer gestoppt`);
  }
  
  const result = {
    timestamp: new Date().toISOString(),
    status: fixes.length > 0 ? 'FIXED' : 'NO_FIX_NEEDED',
    fixes_applied: fixes,
    after_fix: {
      monitor_on: monitor_on,
      stream: stream,
      stream_front_door: stream_front_door,
      monitor_timer_running: timer !== null && timer_start_time !== null,
      stream_timer_running: timer_stream !== null && timer_stream_start_time !== null
    },
    debug_log: debugLog,
    duration_ms: Date.now() - startTime
  };
  
  if (fixes.length > 0) {
    debugLog.push(`[${new Date().toISOString()}] Auto-Fix abgeschlossen: ${fixes.length} Probleme behoben`);
  } else {
    debugLog.push(`[${new Date().toISOString()}] Keine Timer-Probleme gefunden`);
  }
  
  res.status(200).json(result);
});

// Auto-Fix für kritische Hardware/Software Inkonsistenzen
app.get('/api/debug/auto_fix_consistency', (req, res) => {
  const startTime = Date.now();
  const debugLog = [];
  
  debugLog.push(`[${new Date().toISOString()}] Starte Auto-Fix für Hardware/Software Konsistenz`);
  debugLog.push(`[${new Date().toISOString()}] Aktueller monitor_on: ${monitor_on}`);
  
  // Prüfe aktuellen Hardware-Status
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr', (error, stdout, stderr) => {
    if (error) {
      debugLog.push(`[${new Date().toISOString()}] ERROR: Kann Hardware-Status nicht prüfen: ${error.message}`);
      return res.status(500).json({
        status: 'ERROR',
        message: 'Hardware-Status-Prüfung fehlgeschlagen',
        debug_log: debugLog,
        duration_ms: Date.now() - startTime
      });
    }
    
    let actualMonitorStatus = 'unknown';
    const hdmiMatch = stdout.match(/HDMI-A-1[\s\S]*?(?=\n\w|$)/);
    
    if (hdmiMatch) {
      actualMonitorStatus = hdmiMatch[0].includes('Enabled: yes') ? 'on' : 'off';
      debugLog.push(`[${new Date().toISOString()}] Hardware-Status: ${actualMonitorStatus}`);
    } else {
      debugLog.push(`[${new Date().toISOString()}] WARNING: HDMI-A-1 nicht erkannt`);
      return res.status(500).json({
        status: 'ERROR',
        message: 'HDMI-A-1 Output nicht gefunden',
        debug_log: debugLog,
        duration_ms: Date.now() - startTime
      });
    }
    
    // Prüfe kritische Inkonsistenzen
    const criticalInconsistency = (monitor_on === true && actualMonitorStatus === 'off');
    const minorInconsistency = (monitor_on === false && actualMonitorStatus === 'on');
    
    if (criticalInconsistency) {
      debugLog.push(`[${new Date().toISOString()}] CRITICAL: Software=ON, Hardware=OFF - Fixe Software-Status`);
      monitor_on = false;
      debugLog.push(`[${new Date().toISOString()}] monitor_on auf false korrigiert`);
      
      // Stoppe auch Timer da Monitor eh aus ist
      clearTimeout(timer);
      timer_start_time = null;
      clearTimeout(timer_stream);
      timer_stream_start_time = null;
      debugLog.push(`[${new Date().toISOString()}] Timer gestoppt da Monitor aus ist`);
      
      return res.status(200).json({
        status: 'CRITICAL_FIXED',
        action: 'Software-Status auf Hardware-Status synchronisiert',
        before: { software_monitor_on: true, hardware_status: 'off' },
        after: { software_monitor_on: false, hardware_status: 'off' },
        debug_log: debugLog,
        duration_ms: Date.now() - startTime
      });
      
    } else if (minorInconsistency) {
      debugLog.push(`[${new Date().toISOString()}] MINOR: Software=OFF, Hardware=ON - Fixe Software-Status`);
      monitor_on = true;
      debugLog.push(`[${new Date().toISOString()}] monitor_on auf true korrigiert`);
      
      // Starte Timer da Monitor an ist
      clearTimeout(timer);
      timer_start_time = null;
      runTimer();
      clearTimeout(timer_stream);
      timer_stream_start_time = null;
      runTimer_stream();
      debugLog.push(`[${new Date().toISOString()}] Auto-OFF Timer gestartet`);
      
      return res.status(200).json({
        status: 'MINOR_FIXED',
        action: 'Software-Status auf Hardware-Status synchronisiert und Timer gestartet',
        before: { software_monitor_on: false, hardware_status: 'on' },
        after: { software_monitor_on: true, hardware_status: 'on' },
        debug_log: debugLog,
        duration_ms: Date.now() - startTime
      });
      
    } else {
      debugLog.push(`[${new Date().toISOString()}] OK: Software und Hardware sind bereits synchron`);
      
      return res.status(200).json({
        status: 'NO_FIX_NEEDED',
        action: 'Keine Inkonsistenz gefunden',
        current_state: { software_monitor_on: monitor_on, hardware_status: actualMonitorStatus },
        debug_log: debugLog,
        duration_ms: Date.now() - startTime
      });
    }
  });
});

function exit() {
  console.log("Exiting");
  pir.unexport();
  process.exit();
}

process.on('SIGINT', exit);
