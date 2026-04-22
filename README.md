# UniFi Doorbell Monitor

Dieses Projekt zeigt ein Haus-Dashboard im Firefox-Kiosk und blendet bei Klingeln oder manuellen Triggern einen UniFi-RTSP-Stream in der Weboberfläche ein. Der aktuelle Standardpfad nutzt `go2rtc` als nativen Streaming-Gateway auf dem Raspberry Pi.

## Architektur

- Node/Express liefert Dashboard, API und Kiosk-Steuerung.
- Firefox bleibt im Kiosk auf `/status/`.
- `go2rtc` liest die RTSP-Streams und liefert sie browserfähig per WebRTC aus.
- Die Stream-Ansicht läuft als eigene Seite innerhalb der Weboberfläche, nicht mehr als separates Python-Fenster.
- Streams, Kalender-URL und Aktionsbuttons können direkt über die Weboberfläche bearbeitet werden.

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
- lädt `go2rtc` als Binary nach `/usr/local/bin/go2rtc`
- erzeugt bei Bedarf:
  - `config/go2rtc.yaml`
  - `config/app-config.json`
  - `status-dashboard/config/calendar-url.txt`
- registriert `go2rtc` als `systemd`-Dienst
- hinterlegt einen gezielten `sudoers`-Eintrag, damit die Weboberfläche `go2rtc` nach Konfigurationsänderungen neu starten kann
- startet die Node-App über PM2

## Wichtige Dateien

- `server.js`
  Zentrale API, Monitor-Steuerung, go2rtc-Proxy, UI-State
- `config/go2rtc.yaml`
  Lokale go2rtc-Konfiguration mit den RTSP-Quellen
- `config/app-config.json`
  UI-Modes, Stream-Mapping, Aktionsbuttons
- `status-dashboard/index.html`
  Dashboard
- `status-dashboard/stream.html`
  Dedizierte Stream-Seite
- `status-dashboard/settings.html`
  Einstellungen für Streams, Kalender und Aktionsbuttons

## Konfiguration

### Weboberfläche

Die Konfiguration ist unter `/status/settings.html` erreichbar. Dort lassen sich ändern:

- Kalender-URL
- Doorbell- und Frontyard-RTSP-URL
- go2rtc Listen-Adressen
- Stream-Titel
- URLs und Labels für Gartentor und Eingangstür

Beim Speichern schreibt die Node-App:

- `config/app-config.json`
- `config/go2rtc.yaml`
- `status-dashboard/config/calendar-url.txt`

und versucht danach automatisch `go2rtc` neu zu starten.

### go2rtc Streams

Die RTSP-Quellen liegen weiterhin in `config/go2rtc.yaml`:

```yaml
streams:
  doorbell:
    - rtsp://192.168.1.1:7447/3Zs8SwrImTV2rjNs
  frontyard:
    - rtsp://192.168.1.1:7447/UWlJ0sQ5GKc9Qygj
```

### UniFi Protect: RTSP-URL aus der Konsole übernehmen

Wenn du in UniFi eine **RTSPS**-URL kopierst, passt sie für **go2rtc** oft nicht unverändert. Übliche Anpassungen:

1. **`rtsps://` → `rtsp://`**  
   Das **`s`** (TLS im Schema-Namen) entfernen, wenn du **Klartext-RTSP** wie in den Beispielen oben nutzt.

2. **Alles ab `?` streichen**  
   Zusätze wie **`?enableSrtp`** oder andere Query-Parameter **komplett entfernen** – die URL endet dann direkt nach dem Stream-Pfad.

3. **Port prüfen und ggf. anpassen**  
   RTSPS-Links zeigen oft Port **`7441`**. Für **`rtsp://`** ohne TLS nutzt Protect typischerweise **`7447`** (je nach Konsole/Firmware; in der Protect-Oberfläche den Hinweis zum RTSP-Port lesen). Der Port aus dem kopierten RTSPS-Link ist also **nicht** automatisch der richtige für deine `rtsp://`-Zeile.

**Beispiel:** aus  
`rtsps://192.168.1.1:7441/abc123?enableSrtp`  
wird z. B.  
`rtsp://192.168.1.1:7447/abc123`.

Wenn du **TLS** beibehalten willst, bietet go2rtc für UniFi oft **`rtspx://`** statt `rtsps://` an (ohne `?enableSrtp`); Details in der [go2rtc-RTSP-Dokumentation](https://go2rtc.org/internal/rtsp/).

### Aktionsbuttons

Die Buttons für Gartentor und Eingangstür werden über `config/app-config.json` gesteuert:

```json
{
  "actions": [
    {
      "id": "open-gate",
      "label": "Gartentor öffnen",
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
- `/api/settings`
- `/api/actions/:id`
- `/go2rtc/*` als lokaler Reverse Proxy zur nativen go2rtc-Instanz

## Betrieb

### go2rtc

`go2rtc` startet automatisch beim Systemstart über `systemd`:

```bash
systemctl status go2rtc
journalctl -u go2rtc -f
```

### Node/Kiosk

Die Web-App läuft über PM2:

```bash
pm2 status
pm2 logs unifi-doorbell-monitor
pm2 restart unifi-doorbell-monitor
```

## Hinweise

- `go2rtc` lauscht in der Beispielkonfiguration lokal auf `127.0.0.1:1984`; die Web-App bindet es über `/go2rtc/` ein.
- Für stabile WebRTC-Nutzung im LAN kann Port `8555` relevant sein.
- Die alten Python/GStreamer-Dateien bleiben im Repository, sind aber nicht mehr der Standardpfad.
