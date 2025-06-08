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
const runTimer = () => {
  timer = setTimeout(() => {
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5
    exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    monitor_on = false;
    stream = false;
    stream_front_door = false;
    
  }, "300000"); //Screen auto of after 5 min
};

//Timer for kill streams only
let timer_stream;
const runTimer_stream = () => {
  timer_stream = setTimeout(() => {
    exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream

    stream = false;
    stream_front_door = false;
    
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
    runTimer();
    clearTimeout(timer_stream);
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
  runTimer();
  clearTimeout(timer_stream);
  runTimer_stream();
  res.status(200).json( { Status: 'OK'});  
});

app.get('/api/stop_streaming_and_turn_off_monitor', (req, res) => {
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
  if (monitor_on || isChangingMonitor) {
    return res.status(200).json({ Status: 'AlreadyOnOrPending' });
  }

  isChangingMonitor = true;
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error) => {
    isChangingMonitor = false;
    if (error) {
      console.error("Fehler beim Einschalten:", error.message);
      monitor_on = false;
      return res.status(500).json({ Status: 'Error', Message: error.message });
    }
    monitor_on = true;
    return res.status(200).json({ Status: 'OK' });
  });
});

app.get('/api/monitor_off', (req, res) => {
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error) => {
    if (error) {
      console.error("Fehler beim Monitor ausschalten:", error.message);
      return res.status(500).json({ Status: 'MonitorOffFailed' });
    }
    monitor_on = false;

    // Jetzt auch die Streams beenden
    exec('pkill -f stream.py');
    exec('pkill -f stream_front_yard.py');
    exec('pkill -f stream_front_yard_after_ring.py');
    stream = false;
    stream_front_door = false;

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

function exit() {
  console.log("Exiting");
  pir.unexport();
  process.exit();
}

process.on('SIGINT', exit);
