#!/bin/sh
sudo apt update
sudo apt install nodejs npm net-tools
npm -i express body-parser pm2 
git clone https://github.com/entttom/unifi-doorbell-monitor/
cd unifi-doorbell-monitor
pm2 start start.js
pm2 save
pm2 autostart
ip addr show | grep 'inet ' | awk '{print "Use this as endpoint in Iobroker or Home Asisstant http://" $2"/api/ring_ring"}'
