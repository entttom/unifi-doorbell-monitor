const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { exec } = require('node:child_process')
//var Gpio = require('onoff').Gpio;
//var pir = new Gpio(417,'in','both'); // Find right PIN "cat /sys/kernel/debug/gpio" PIN12 is named 417 for whatever reason 

let busy = false;

app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

let timer;
const runTimer = () => {
  timer = setTimeout(() => {
    exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5
    exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); // Kill Stream
    busy = false;
  }, "300000"); //Screen auto of after 5 min
};

setTimeout(() => {
exec('firefox --kiosk=http://192.168.1.48', (error, stdout, stderr) => {if (error) {return;}}); // Start Firefox 
}, "10000"); 


setTimeout(() => {
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5 after Start
}, "30000"); 

// Add the edge detection callback to catch the motion detection events
var armed = false;
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
exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi5
setTimeout(() => {
  exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
}, "100"); 
  
clearTimeout(timer);
runTimer();
  
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/stop_streaming_and_turn_off_monitor', (req, res) => {
exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
//exec('export DISPLAY=:0;xset q;xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi3
exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5 
 
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
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/open_stream_window', (req, res) => {
exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/monitor_on', (req, res) => {
//exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}});  //Pi3
if{busy == false} (  
exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi5
busy = true;
clearTimeout(timer);
runTimer();
);
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/monitor_off', (req, res) => {
  //exec('export DISPLAY=:0;xset q;xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); //Pi3 
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen Pi5
  res.status(200).json( { Status: 'OK'});  
});
  app.get('/api/focus_browser', (req, res) => {
    exec('wmctrl -a firefox', (error, stdout, stderr) => {if (error) {return;}}); 
    res.status(200).json( { Status: 'OK'});  
});  

function exit() {
  console.log("Exiting");
  pir.unexport();
  process.exit();
}

process.on('SIGINT', exit);
