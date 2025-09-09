#!/bin/bash
# GStreamer Installation Script für Raspberry Pi
# Dieses Skript installiert alle benötigten GStreamer-Komponenten

echo "=== GStreamer Installation für Raspberry Pi ==="
echo "Installiere GStreamer und Python-Bindings..."

# System-Update
echo "Aktualisiere Paketlisten..."
sudo apt update

# GStreamer Core installieren
echo "Installiere GStreamer Core..."
sudo apt install -y gstreamer1.0-tools \
                    gstreamer1.0-plugins-base \
                    gstreamer1.0-plugins-good \
                    gstreamer1.0-plugins-bad \
                    gstreamer1.0-plugins-ugly \
                    gstreamer1.0-libav

# GStreamer Python-Bindings
echo "Installiere GStreamer Python-Bindings..."
sudo apt install -y python3-gi \
                    python3-gi-cairo \
                    gir1.2-gstreamer-1.0 \
                    gir1.2-gst-plugins-base-1.0

# Hardware-beschleunigte Video-Dekodierung für Raspberry Pi
echo "Installiere Hardware-Video-Dekodierung..."
sudo apt install -y gstreamer1.0-omx \
                    gstreamer1.0-gl \
                    libgstreamer-gl1.0-0

# V4L2-Support für Hardware-Dekodierung
echo "Installiere V4L2-Support..."
sudo apt install -y gstreamer1.0-v4l2 \
                    v4l-utils

# X11/Wayland Video-Output
echo "Installiere Video-Output-Plugins..."
sudo apt install -y gstreamer1.0-x \
                    gstreamer1.0-gtk3

# RTSP/RTP-Support
echo "Installiere RTSP/RTP-Plugins..."
sudo apt install -y gstreamer1.0-rtsp

# PyQt5 (falls noch nicht installiert)
echo "Überprüfe PyQt5-Installation..."
pip3 install PyQt5 requests --user

echo ""
echo "=== Installation abgeschlossen ==="
echo ""

# Test der Installation
echo "Teste GStreamer-Installation..."
if gst-inspect-1.0 --version > /dev/null 2>&1; then
    echo "✓ GStreamer Core: OK"
    gst-inspect-1.0 --version
else
    echo "✗ GStreamer Core: FEHLER"
fi

if gst-inspect-1.0 rtspsrc > /dev/null 2>&1; then
    echo "✓ RTSP-Support: OK"
else
    echo "✗ RTSP-Support: FEHLER"
fi

if gst-inspect-1.0 v4l2h264dec > /dev/null 2>&1; then
    echo "✓ Hardware H.264-Dekodierung: OK"
else
    echo "✗ Hardware H.264-Dekodierung: FEHLER (fallback auf Software-Dekodierung)"
fi

if gst-inspect-1.0 xvimagesink > /dev/null 2>&1; then
    echo "✓ X11 Video-Output: OK"
else
    echo "✗ X11 Video-Output: FEHLER"
fi

echo ""
echo "Python GStreamer-Bindings testen..."
python3 -c "
try:
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gst
    Gst.init(None)
    print('✓ Python GStreamer-Bindings: OK')
    print('  Version:', Gst.version_string())
except Exception as e:
    print('✗ Python GStreamer-Bindings: FEHLER')
    print('  Fehler:', str(e))
"

echo ""
echo "=== Installation und Test abgeschlossen ==="
echo ""

# PM2 und Node.js-Dependencies installieren
echo "Installiere Node.js-Dependencies und PM2..."
sudo apt install -y nodejs npm
sudo npm install -g pm2

# Lokale Node.js-Pakete installieren
echo "Installiere lokale Node.js-Pakete..."
npm install express body-parser

echo ""
echo "=== PM2 Auto-Start Setup ==="
echo ""

# PM2 Auto-Start konfigurieren
echo "Konfiguriere PM2 für Auto-Start beim Boot..."
pm2 startup systemd -u pi --hp /home/pi
echo ""
echo "WICHTIG: Führe folgenden Befehl als ROOT aus (wird angezeigt):"
pm2 startup systemd -u pi --hp /home/pi 2>&1 | grep "sudo env"

echo ""
echo "Starte UniFi Doorbell Monitor mit PM2..."
DISPLAY=:0 pm2 start start_with_button_on_side.js --name "unifi-doorbell-monitor"
pm2 save

echo ""
echo "=== Installation abgeschlossen ==="
echo ""
echo "Der UniFi Doorbell Monitor läuft jetzt und startet automatisch beim Boot!"
echo ""
echo "Nützliche PM2-Befehle:"
echo "- pm2 status                 (Status anzeigen)"
echo "- pm2 logs unifi-doorbell-monitor  (Logs anzeigen)"
echo "- pm2 restart unifi-doorbell-monitor  (Neustart)"
echo "- pm2 stop unifi-doorbell-monitor     (Stoppen)"
echo ""
echo "API-Endpunkte:"
echo "- http://$(hostname -I | awk '{print $1}'):3000/api/ring_ring"
echo "- http://$(hostname -I | awk '{print $1}'):3000/api/front_yard"
echo "- http://$(hostname -I | awk '{print $1}'):3000/api/debug"
echo ""
echo "Bei Problemen mit Hardware-Dekodierung wird automatisch auf Software-Dekodierung umgeschaltet."
