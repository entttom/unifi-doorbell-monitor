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

exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen

exec('vlc', (error, stdout, stderr) => { //Start VLC
    
    if (error) {
        console.error(`exec error: ${error}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`)
  
});
exec('vlc rtsp://192.168.1.1:7447/6OHQ0QIWgxnIbTTp --no-video-deco --no-embedded-video --video-x=0 --video-y=0 --width=924 --height=600', (error, stdout, stderr) => {
    
    if (error) {
        console.error(`exec error: ${error}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`)
  
});

exec('./button && wmctrl -r button -e 0,925,0,100,600', (error, stdout, stderr) => {
    //gravity,X,Y,width,height
    if (error) {
        console.error(`exec error: ${error}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`)
  
});

  
const time = 30; // time after streaming stops

setTimeout(() => {
    exec('killall -9 vlc && killall -9 button', (error, stdout, stderr) => {
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
