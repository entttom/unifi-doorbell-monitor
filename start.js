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

app.post('/api/ring_ring', (req, res) => {


//start vlc, check ifts already running
exec('if pgrep vlc > /dev/null; then echo "VLC is already running"; else vlc & fi', (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
});

exec('xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen

// start stream - change IP to match RTSP Stream!
  // EDIT Unifi Stream url
  //remove the second s in rtsps
  //change port from 7441 to 7447
  //remove (?enableSrtp)
rtsp://192.168.1.1:7447/QxJCVMefFHfBnqrp
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
    exec('dbus-send --type=method_call --dest=org.mpris.MediaPlayer2.vlc /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Stop', (error, stdout, stderr) => {
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
