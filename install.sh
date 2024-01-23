#!/bin/sh
sudo apt update
sudo apt install nodejs npm net-tools
npm -i express body-parser pm2 
pm2 start start.js
pm2 save
pm2 autostart
ip addr show | grep 'inet ' | awk '{print "Open the following " $2}'
