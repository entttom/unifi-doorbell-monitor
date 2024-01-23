const { exec } = require('node:child_process')

exec('export DISPLAY=:0;xset q;xset dpms force on', (error, stdout, stderr) => {if (error) {return;}}); // Turn on Screen

exec('vlc;vlc rtsp://192.168.1.1:7447/6OHQ0QIWgxnIbTTp --fullscreen', (error, stdout, stderr) => {
    
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
})
