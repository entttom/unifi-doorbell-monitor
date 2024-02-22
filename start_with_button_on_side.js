const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { exec } = require('node:child_process')

app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


exec('firefox --kiosk http://192.168.1.48', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen  

setTimeout(() => {
  exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --off', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi5
}, "10000"); 
app.get('/api/ring_ring', (req, res) => {

//exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi3
exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi5
setTimeout(() => {
  exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
}, "1000"); 

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
exec('export DISPLAY=:0;firefox --kiosk http://192.168.1.48', (error, stdout, stderr) => {if (error) {return;}}); 
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
exec('WAYLAND_DISPLAY="wayland-1" wlr-randr --output HDMI-A-1 --on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen Pi5
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
