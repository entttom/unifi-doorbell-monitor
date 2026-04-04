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

echo "=== UniFi Doorbell Monitor mit go2rtc installieren ==="
echo "Projektverzeichnis: $ROOT_DIR"
echo "Installationsbenutzer: $INSTALL_USER"

sudo apt update
sudo apt install -y curl ca-certificates nodejs npm firefox-esr wmctrl
sudo npm install -g pm2

mkdir -p "$CONFIG_DIR"
mkdir -p "$STATUS_CONFIG_DIR"

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

cd "$ROOT_DIR"
npm install

if pm2 describe unifi-doorbell-monitor >/dev/null 2>&1; then
  DISPLAY=:0 pm2 restart unifi-doorbell-monitor --update-env
else
  DISPLAY=:0 pm2 start server.js --name unifi-doorbell-monitor
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
echo "Weboberfläche: http://$(hostname -I | awk '{print $1}'):3000/status/"
echo "API Debug:      http://$(hostname -I | awk '{print $1}'):3000/api/debug"
echo "go2rtc intern:  http://127.0.0.1:1984/"
