

# Unifi doorbell monitor
I used a raspberry pi 3 with raspbian OS with this [Monitor](https://www.amazon.de/Raspberry-Touchscreen-WIMAXIT-Tragbarer-doppeltem/dp/B09QPWRCB1?th=1). Every other linux pc should do it as well.

***** Next step only you use the display above WIMAXIT M1012****
Open the file "/boot/config.txt" or bookworm and above "/boot/firmware/config.txt" on the SD card on the computer, add the following at the end of the file, save and exit.

`hdmi_force_edid_audio=1
max_usb_current=1
hdmi_force_hotplug=1
config_hdmi_boost=7
hdmi_group=2
hdmi_mode=87
hdmi_drive=2
display_rotate=0
hdmi_timings=1024 1 200 18 200 600 1 50 3 50 0 0 0 60 0 51200000 3`
***************************


Install: `wget  -q -O - https://raw.githubusercontent.com/entttom/unifi-doorbell-monitor/main/install.sh | bash`

 - Get unifi rtsp camera url from unifi protect
 - modify URL:
	 - remove the second s in rtsps   
	 - change port from 7441 to 7447   
	 - remove
	   (?enableSrtp)

*For example* `rtsps://192.168.1.1:7441/sdFHFJ8juKDBDDJD?enableSrtp`
*Should look like* `rtsp://192.168.1.1:7447/sdFHFJ8juKDBDDJD`

 - *Edit Line 29 and adapt the URL.*

Autostart is automatic enabled.

nano ~/.bashrc
export DISPLAY=:0 
. ~/.bashrc

Modifications:

 - Edit time variable in start.js to adapt the monitor shut off time.
 - If you want vlc in fullscreen use the parameter `--fullscreen` in
   line 29 instead of  `--no-video-deco --no-embedded-video --video-x=0
   --video-y=0 --width=924 --height=600`

**How does it work**

Use Home Assistant or Iobroker to call http://IP_ADRESS:3000/api/ring_ring/ when the bell is ringing to turn on the monitor for 30 seconds and show the stream. The monitor will turn off after 30 seconds.

**How does it work**
Variants: 
There is also a Version (with button) which shows the video stream via vlc on the left side of the display and on the right side is a big button which performs a curl request - in my case to an iobroker API to open the garden gate. if you install this version you have to adapt the curl request and the window size of your display.

In HA you can use a automation. Something like this:

    alias: G4 Doorbell to Intercom
    description: ''
    trigger:
      - platform: state
        entity_id: binary_sensor.front_doorbell_doorbell
        from: 'off'
        to: 'on'
    condition: []
    action:
      - service: shell_command.monitor_on
        data:
          url: 'http://192.168.1.192/api/ring_ring'
    mode: single

**Attention: You should assign a static IP adress to your raspberry.**
