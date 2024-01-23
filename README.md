# unifi-doorbell-monitor
Install wget  -q -O - https://raw.githubusercontent.com/entttom/unifi-doorbell-monitor/main/install.sh | bash

Get unifi rtsp url from unifi protect
modify URL
  
  //remove the second s in rtsps
  //change port from 7441 to 7447
  //remove (?enableSrtp)
for example rtsps://192.168.1.1:7441/sdFHFJ8juKDBDDJD?enableSrtp
should look like rtsp://192.168.1.1:7447/sdFHFJ8juKDBDDJD
Fot Autostart:
# Installing pm2    
npm install -g pm2 # may require sudo

# Starting the app
pm2 start ~/pi/start.js
pm2 save    # saves the running processes
            # if not saved, pm2 will forget
            # the running apps on next boot


# check status 
pm2 list

# IMPORTANT: If you want pm2 to start on system boot
pm2 startup # starts pm2 on computer boot
