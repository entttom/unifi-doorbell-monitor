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

app.get('/api/ring_ring', (req, res) => {
//exec('pkill -f firefox', (error, stdout, stderr) => {if (error) 4{return;}}); // Turn on Screen
exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen
exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/stop_streaming_and_turn_off_monitor', (req, res) => {
exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
exec('wmctrl -a firefox', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen  
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
exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); 
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/monitor_off', (req, res) => {
  exec('export DISPLAY=:0;xset q;xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); 
  res.status(200).json( { Status: 'OK'});  
});
  app.get('/api/focus_browser', (req, res) => {
    exec('wmctrl -a firefox', (error, stdout, stderr) => {if (error) {return;}}); 
    res.status(200).json( { Status: 'OK'});  
});  
