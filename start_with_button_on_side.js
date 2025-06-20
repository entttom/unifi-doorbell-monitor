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
        exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
        stream = true;
        stream_front_door = true;
      };
    }, "2000"); 
    }
    if(monitor_on == true) {
      exec('pkill -f stream_front_yard.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
      exec('pkill -f stream_front_yard_after_ring.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
      exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
      stream = true;
      stream_front_door = true;
    };
  
    clearTimeout(timer);
    runTimer();
    clearTimeout(timer_stream);
    runTimer_stream();
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
  res.status(200).json( { Status: 'OK',Steam: stream, Monitor: monitor_on, FrontDoor: stream_front_door,});  
});  


function exit() {
  console.log("Exiting");
  pir.unexport();
  process.exit();
}

process.on('SIGINT', exit);
