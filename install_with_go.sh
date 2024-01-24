#!/bin/sh
sudo apt update
sudo apt install nodejs npm net-tools vlc golang-go wmctrl -y
git clone https://github.com/entttom/unifi-doorbell-monitor/
cd unifi-doorbell-monitor
sudo npm i -g express body-parser pm2
go mod init button
go build
pm2 start start.js
pm2 save
pm2 autostart
ip addr show | grep 'inet ' | awk '{print "Use this as endpoint in Iobroker or Home Asisstant http://" $2"/api/ring_ring"}'
