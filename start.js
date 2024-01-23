const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { exec } = require('node:child_process')

app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

exec('export DISPLAY=:0;xset q;xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen

app.get('/api/ring_ring', (req, res) => {

exec('xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen

// start stream - change IP to match RTSP Stream!
  // EDIT Unifi Stream url
  //remove the second s in rtsps
  //change port from 7441 to 7447
  //remove (?enableSrtp)

  exec('vlc rtsp://192.168.1.1:7447/6OHQ0QIWgxnIbTTp --fullscreen', (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`)
  
});

const time = 30; // time after streaming stops

setTimeout(() => {
    exec('killall -9 vlc', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
    });
    
    exec('xset dpms force off', (error, stdout, stderr) => {if (error) {return;}}); // Turn off Screen
    
}, time * 1000);
  
res.status(200).json( { Status: 'OK'});  
});
