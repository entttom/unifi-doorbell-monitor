#!/bin/sh
sudo apt update
sudo apt install nodejs npm net-tools vlc wmctrl -y
git clone https://github.com/entttom/unifi-doorbell-monitor/
cd unifi-doorbell-monitor
sudo npm i -g pm2
npm i express body-parser onoff
pip install python-vlc rpyc PyQt5
pip install rpyc --break-system-packages
pip install python-vlc --break-system-packages
pm2 start start_with_button_on_side.js
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u pi --hp /home/pi
pm2 save
ip addr show | grep 'inet ' | awk '{print "Use this as endpoint in Iobroker or Home Asisstant http://" $2"/api/ring_ring"}'
