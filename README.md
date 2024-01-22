# unifi-doorbell-monitor
Unifi Doorbell Monitor for Live View when ringing


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
