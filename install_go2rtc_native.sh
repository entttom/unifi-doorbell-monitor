#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$ROOT_DIR/config"
STATUS_CONFIG_DIR="$ROOT_DIR/status-dashboard/config"
INSTALL_USER="${SUDO_USER:-$USER}"
INSTALL_HOME="$(getent passwd "$INSTALL_USER" | cut -d: -f6)"
GO2RTC_VERSION="${GO2RTC_VERSION:-}"
GO2RTC_FALLBACK_VERSION="v1.9.13"
GO2RTC_BIN_URL=""
# Port der Node-App. Port 80 wird per iptables hierher umgeleitet (siehe unten).
APP_PORT="${APP_PORT:-3000}"
# REDIRECT_PORT_80=0 überspringt die Umleitung, falls auf dem Pi schon etwas auf 80 lauscht.
REDIRECT_PORT_80="${REDIRECT_PORT_80:-1}"

echo "=== UniFi Doorbell Monitor mit go2rtc installieren ==="
echo "Projektverzeichnis: $ROOT_DIR"
echo "Installationsbenutzer: $INSTALL_USER"
echo "Port der Weboberfläche: $APP_PORT (Port 80 wird umgeleitet: $REDIRECT_PORT_80)"

sudo apt update
# ffmpeg liefert ffplay für /api/play_sound (Lautstärke + Tempo ohne Tonhöhenversatz).
sudo apt install -y curl ca-certificates nodejs npm firefox-esr wmctrl ffmpeg iptables
sudo npm install -g pm2

mkdir -p "$CONFIG_DIR"
mkdir -p "$STATUS_CONFIG_DIR"
mkdir -p "$ROOT_DIR/sounds"

if [ ! -f "$CONFIG_DIR/app-config.json" ]; then
  cp "$CONFIG_DIR/app-config.example.json" "$CONFIG_DIR/app-config.json"
  echo "config/app-config.json wurde aus dem Beispiel erstellt."
fi

if [ ! -f "$CONFIG_DIR/go2rtc.yaml" ]; then
  cp "$CONFIG_DIR/go2rtc.yaml.example" "$CONFIG_DIR/go2rtc.yaml"
  echo "config/go2rtc.yaml wurde aus dem Beispiel erstellt."
fi

if [ ! -f "$STATUS_CONFIG_DIR/calendar-url.txt" ] && [ -f "$STATUS_CONFIG_DIR/calendar-url.example.txt" ]; then
  cp "$STATUS_CONFIG_DIR/calendar-url.example.txt" "$STATUS_CONFIG_DIR/calendar-url.txt"
  echo "status-dashboard/config/calendar-url.txt wurde aus dem Beispiel erstellt."
fi

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64)
    GO2RTC_ASSET="go2rtc_linux_arm64"
    ;;
  armv7l|armv7|armhf)
    GO2RTC_ASSET="go2rtc_linux_arm"
    ;;
  x86_64)
    GO2RTC_ASSET="go2rtc_linux_amd64"
    ;;
  *)
    echo "Nicht unterstützte Architektur: $ARCH"
    exit 1
    ;;
esac

if [ -z "$GO2RTC_VERSION" ]; then
  GO2RTC_VERSION="$(curl -fsSL https://api.github.com/repos/AlexxIT/go2rtc/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1 || true)"
fi

if [ -z "$GO2RTC_VERSION" ]; then
  GO2RTC_VERSION="$GO2RTC_FALLBACK_VERSION"
fi

GO2RTC_BIN_URL="https://github.com/AlexxIT/go2rtc/releases/download/${GO2RTC_VERSION}/${GO2RTC_ASSET}"

echo "Installiere go2rtc ${GO2RTC_VERSION} für ${ARCH} ..."
curl -fsSL "$GO2RTC_BIN_URL" -o /tmp/go2rtc
chmod +x /tmp/go2rtc
sudo install -m 0755 /tmp/go2rtc /usr/local/bin/go2rtc
rm -f /tmp/go2rtc

sudo tee /etc/systemd/system/go2rtc.service >/dev/null <<EOF
[Unit]
Description=go2rtc streaming gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${INSTALL_USER}
Group=${INSTALL_USER}
WorkingDirectory=${ROOT_DIR}
ExecStart=/usr/local/bin/go2rtc -config ${ROOT_DIR}/config/go2rtc.yaml
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/sudoers.d/unifi-doorbell-monitor-go2rtc >/dev/null <<EOF
${INSTALL_USER} ALL=(root) NOPASSWD: /bin/systemctl restart go2rtc, /bin/systemctl status go2rtc, /usr/bin/systemctl restart go2rtc, /usr/bin/systemctl status go2rtc
EOF
sudo chmod 440 /etc/sudoers.d/unifi-doorbell-monitor-go2rtc

sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc

# Port 80 auf die Node-App umleiten, damit http://<pi-ip>/ ohne Portangabe funktioniert.
# Die OUTPUT-Regel ist nötig, damit auch der Kiosk-Browser auf dem Pi selbst Port 80 erreicht.
# -C prüft vorher, sonst sammeln sich bei jedem Lauf doppelte Regeln an.
if [ "$REDIRECT_PORT_80" = "1" ]; then
  sudo tee /etc/systemd/system/unifi-doorbell-monitor-port80.service >/dev/null <<EOF
[Unit]
Description=Port 80 auf die Weboberfläche (Port ${APP_PORT}) umleiten
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${APP_PORT} 2>/dev/null || iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${APP_PORT}'
ExecStart=/bin/sh -c 'iptables -t nat -C OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port ${APP_PORT} 2>/dev/null || iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port ${APP_PORT}'
ExecStop=/bin/sh -c 'iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port ${APP_PORT} 2>/dev/null || true'
ExecStop=/bin/sh -c 'iptables -t nat -D OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port ${APP_PORT} 2>/dev/null || true'

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable --now unifi-doorbell-monitor-port80
  echo "Port 80 wird auf ${APP_PORT} umgeleitet (Dienst unifi-doorbell-monitor-port80)."
fi

cd "$ROOT_DIR"
npm install

if pm2 describe unifi-doorbell-monitor >/dev/null 2>&1; then
  PORT="$APP_PORT" DISPLAY=:0 pm2 restart unifi-doorbell-monitor --update-env
else
  PORT="$APP_PORT" DISPLAY=:0 pm2 start server.js --name unifi-doorbell-monitor
fi

pm2 save

if [ -n "$INSTALL_HOME" ]; then
  pm2 startup systemd -u "$INSTALL_USER" --hp "$INSTALL_HOME" >/tmp/unifi-doorbell-monitor-pm2-startup.txt 2>&1 || true
  if grep -q "sudo" /tmp/unifi-doorbell-monitor-pm2-startup.txt; then
    echo ""
    echo "PM2 Startup Hinweis:"
    grep "sudo" /tmp/unifi-doorbell-monitor-pm2-startup.txt || true
  fi
fi

echo ""
echo "=== Installation abgeschlossen ==="
echo "go2rtc Dienststatus:"
systemctl --no-pager --full status go2rtc | sed -n '1,12p' || true
echo ""
echo "Node/PM2 Status:"
pm2 status || true
echo ""
PI_IP="$(hostname -I | awk '{print $1}')"
if [ "$REDIRECT_PORT_80" = "1" ]; then
  BASE_URL="http://${PI_IP}"
else
  BASE_URL="http://${PI_IP}:${APP_PORT}"
fi

echo "Weboberfläche: ${BASE_URL}/"
echo "Einstellungen: ${BASE_URL}/status/settings.html"
echo "API Debug:      ${BASE_URL}/api/debug"
echo "Direkt:         http://${PI_IP}:${APP_PORT}/"
echo "go2rtc intern:  http://127.0.0.1:1984/"
