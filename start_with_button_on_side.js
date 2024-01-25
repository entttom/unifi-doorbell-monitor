const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { exec } = require('node:child_process')

app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

exec('python steam.py', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen
exec('python browser.py', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen  

exec('export DISPLAY=:0;xset q;xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen

app.get('/api/ring_ring', (req, res) => {
exec('pkill -f browser.py', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen
exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen
exec('python stream_start.py', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen
res.status(200).json( { Status: 'OK'});  
});

app.get('/api/stop_browser', (req, res) => {
exec('pkill -f browser.py', (error, stdout, stderr) => {if (error) {return;}}); 
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/start_browser', (req, res) => {
exec('python browser.py', (error, stdout, stderr) => {if (error) {return;}}); 
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/stop_stream_window', (req, res) => {
exec('pkill -f stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
res.status(200).json( { Status: 'OK'});  
});
app.get('/api/start_stream_window', (req, res) => {
exec('python stream.py', (error, stdout, stderr) => {if (error) {return;}}); 
res.status(200).json( { Status: 'OK'});  
});
