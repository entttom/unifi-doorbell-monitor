
# Unifi doorbell monitor
I used a raspberry pi 3 with raspbian OS with this [Monitor](https://www.amazon.com/dp/B09XDK2FRR/ref=sr_1_2_sspa?crid=ZSL2YLX1X5C0&keywords=raspberry%20pi%2010%20zoll%20monitor&qid=1706083972&sprefix=raspberry%20pi%2010%20zoll%20monito,aps,160&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1). Every other linux pc should do it as well.

Install: `wget  -q -O - https://raw.githubusercontent.com/entttom/unifi-doorbell-monitor/main/install.sh | bash`

 - Get unifi rtsp camera url from unifi protect
 - modify URL:
	 - remove the second s in rtsps   
	 - change port from 7441 to 7447   
	 - remove
	   (?enableSrtp)

*For example* `rtsps://192.168.1.1:7441/sdFHFJ8juKDBDDJD?enableSrtp`
*Should look like* `rtsp://192.168.1.1:7447/sdFHFJ8juKDBDDJD`

 - **Edit Line 29 and adapt the URL.**

Autostart is automatic enabled.


Modifications:

 - Edit time variable in start.js to adapt the monitor shut off time.
 - If you want vlc in fullscreen use the parameter `--fullscreen` in
   line 29 instead of  `--no-video-deco --no-embedded-video --video-x=0
   --video-y=0 --width=924 --height=600`


Use Home Assistant or Iobroker to call http://IP_ADRESS:3000/api/ring_ring/ to turn off the monitor for 30 seconds and sho the stream. 
**Attention: You should assign a static IP adress to your raspberry.**
