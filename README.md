# UniFi Doorbell Monitor

Dieses Projekt zeigt ein Haus-Dashboard im Firefox-Kiosk und blendet bei Klingeln oder manuellen Triggern einen UniFi-RTSP-Stream in der Weboberflaeche ein. Der aktuelle Standardpfad nutzt `go2rtc` als nativen Streaming-Gateway auf dem Raspberry Pi.

## Architektur

- Node/Express liefert Dashboard, API und Kiosk-Steuerung.
- Firefox bleibt im Kiosk auf `/status/`.
- `go2rtc` liest die RTSP-Streams und liefert sie browserfaehig per WebRTC aus.
- Die Stream-Ansicht laeuft als eigene Seite innerhalb der Weboberflaeche, nicht mehr als separates Python-Fenster.

## Installation auf Raspberry Pi

1. Repository auf den Pi holen.
2. Konfigurationsbeispiele anpassen:
   - `config/go2rtc.yaml.example`
   - `config/app-config.example.json`
   - `status-dashboard/config/calendar-url.example.txt`
3. Den nativen Installer starten:

```bash
chmod +x install_go2rtc_native.sh
./install_go2rtc_native.sh
```

Das Skript:

- installiert Node.js, npm, PM2, Firefox ESR und `wmctrl`
- laedt `go2rtc` als Binary nach `/usr/local/bin/go2rtc`
- erzeugt bei Bedarf:
  - `config/go2rtc.yaml`
  - `config/app-config.json`
  - `status-dashboard/config/calendar-url.txt`
- registriert `go2rtc` als `systemd`-Dienst
- startet die Node-App ueber PM2

## Wichtige Dateien

- `start_with_button_on_side.js`
  Zentrale API, Monitor-Steuerung, go2rtc-Proxy, UI-State
- `config/go2rtc.yaml`
  Lokale go2rtc-Konfiguration mit den RTSP-Quellen
- `config/app-config.json`
  UI-Modes, Stream-Mapping, Aktionsbuttons
- `status-dashboard/index.html`
  Dashboard
- `status-dashboard/stream.html`
  Dedizierte Stream-Seite

## Konfiguration

### go2rtc Streams

Die RTSP-Quellen liegen in `config/go2rtc.yaml`:

```yaml
streams:
  doorbell:
    - rtsp://192.168.1.1:7447/3Zs8SwrImTV2rjNs
  frontyard:
    - rtsp://192.168.1.1:7447/UWlJ0sQ5GKc9Qygj
```

### Aktionsbuttons

Die Buttons fuer Gartentor und Eingangstuer werden ueber `config/app-config.json` gesteuert:

```json
{
  "actions": [
    {
      "id": "open-gate",
      "label": "Gartentor oeffnen",
      "method": "GET",
      "url": "http://..."
    }
  ]
}
```

## API

Bestehende Trigger bleiben erhalten:

- `/api/ring_ring`
- `/api/front_yard`
- `/api/open_stream_window`
- `/api/open_stream_window_front_yard`
- `/api/kill_stream_window`
- `/api/monitor_on`
- `/api/monitor_off`
- `/api/debug`

Neue Hilfsendpunkte:

- `/api/ui_state`
- `/api/actions/:id`
- `/go2rtc/*` als lokaler Reverse Proxy zur nativen go2rtc-Instanz

## Betrieb

### go2rtc

`go2rtc` startet automatisch beim Systemstart ueber `systemd`:

```bash
systemctl status go2rtc
journalctl -u go2rtc -f
```

### Node/Kiosk

Die Web-App laeuft ueber PM2:

```bash
pm2 status
pm2 logs unifi-doorbell-monitor
pm2 restart unifi-doorbell-monitor
```

## Hinweise

- `go2rtc` lauscht in der Beispielkonfiguration lokal auf `127.0.0.1:1984`; die Web-App bindet es ueber `/go2rtc/` ein.
- Fuer stabile WebRTC-Nutzung im LAN kann Port `8555` relevant sein.
- Die alten Python/GStreamer-Dateien bleiben im Repository, sind aber nicht mehr der Standardpfad.
