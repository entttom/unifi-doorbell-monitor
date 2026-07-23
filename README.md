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
- startet die Node-App über PM2 auf **Port 80**

### Port der Weboberfläche

Standard ist Port 80, damit `http://<pi-ip>/` ohne Portangabe funktioniert. Weil ein normaler
Benutzer keine Ports unter 1024 binden darf, gibt das Installskript dem Node-Binary die dafür
nötige Capability, statt PM2 als root laufen zu lassen:

```bash
sudo setcap 'cap_net_bind_service=+ep' $(readlink -f $(which node))
```

**Wichtig:** Ein Update des `nodejs`-Pakets setzt das zurück — die App startet danach nicht mehr
(`EACCES: permission denied 0.0.0.0:80`). Dann den Befehl oben erneut ausführen und
`pm2 restart unifi-doorbell-monitor`.

Ein anderer Port geht ohne Capability:

```bash
APP_PORT=3000 ./install_go2rtc_native.sh
```

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
  Einstellungen für Streams, Kalender, Aktionsbuttons und Sounds
- `sounds/`
  Hochgeladene MP3s für `/api/play_sound` (nicht im Repository)

## Konfiguration

### Weboberfläche

Die Konfiguration ist unter `/status/settings.html` erreichbar. Dort lassen sich ändern:

- Kalender-URL
- Doorbell- und Frontyard-RTSP-URL
- go2rtc Listen-Adressen
- Stream-Titel
- URLs und Labels für Gartentor und Eingangstür
- Sounds hochladen, umbenennen, löschen und mit den gewünschten Parametern testen

Der Sound-Bereich speichert sofort und ist unabhängig vom Speichern-Button. Die dort eingestellten
Werte für Lautstärke, Wiederholungen, Geschwindigkeit und Pause gelten für den Test-Button und
werden als fertige API-URL unter der Liste angezeigt.

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

### Sounds abspielen

`/api/play_sound` spielt eine hochgeladene Datei aus `sounds/` über den Audio-Ausgang des Pi ab
(GET oder POST, Parameter als Query-String oder JSON-Body):

```bash
curl "http://pi:3000/api/play_sound?file=tuerklingen.mp3&volume=80&repeat=3&speed=1.0&pause=true&pauseMs=500"
```

| Parameter | Standard | Bereich | Bedeutung |
| --- | --- | --- | --- |
| `file` | – | – | Dateiname inkl. Endung, z. B. `tuerklingen.mp3` (Pflicht) |
| `volume` | `100` | 0–100 | Lautstärke in Prozent |
| `repeat` | `1` | 1–50 | Wie oft die Datei hintereinander gespielt wird |
| `speed` | `1.0` | 0.5–2.0 | Abspielgeschwindigkeit |
| `pause` | `false` | true/false | Ob zwischen den Wiederholungen pausiert wird |
| `pauseMs` | `500` | 0–60000 | Dauer der Pause in Millisekunden |
| `wait` | `false` | true/false | Antwort erst nach dem letzten Durchlauf statt sofort |

`pause` darf auch direkt eine Millisekundenzahl sein (`pause=800` entspricht `pause=true&pauseMs=800`).
Werte außerhalb des Bereichs werden begrenzt, nicht abgelehnt. Eine neue Wiedergabe beendet eine
noch laufende.

Verwaltung (wird auch von `/status/settings.html` genutzt):

- `GET /api/sounds` — Liste aller Dateien inkl. erkanntem Player und Limits
- `POST /api/sounds/:name` — Upload, Dateiinhalt als Raw-Body (`Content-Type: application/octet-stream`)
- `POST /api/sounds/:name/rename` — Body `{"newName":"neuer-name.mp3"}`
- `DELETE /api/sounds/:name` — löscht die Datei
- `GET /api/sounds/:name/file` — liefert die Datei aus (Browser-Vorschau)
- `GET /api/stop_sound` — bricht die laufende Wiedergabe ab
- `GET /api/sound_status` — aktueller Wiedergabestatus

Erlaubte Endungen: `.mp3`, `.wav`, `.ogg`, `.oga`, `.m4a`, `.aac`, `.flac` (max. 25 MB pro Datei).
Die Wiedergabe nutzt den ersten verfügbaren Player in dieser Reihenfolge: `ffplay`, `mpv`, `mpg123`,
`cvlc`. Falls keiner installiert ist:

```bash
sudo apt install -y ffmpeg
```

`ffplay` (aus `ffmpeg`) ist die beste Wahl, weil es Lautstärke und Tempo tonhöhenneutral umsetzt;
`mpg123` verschiebt bei `speed` ≠ 1 auch die Tonhöhe.

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
