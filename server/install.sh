#!/bin/bash
# Installation du serveur du jeu "מלון הפאר" (nouveau service, ne touche à aucun bot existant)
set -e
[ "$(id -u)" = 0 ] || { echo "Lance en root"; exit 1; }
D=/opt/hotel-server; mkdir -p $D
RAW=https://raw.githubusercontent.com/chlomo111-bit/hotel-resort/main/server
curl -fsSL $RAW/server.js -o $D/server.js; curl -fsSL $RAW/admin.html -o $D/admin.html
command -v node >/dev/null || { echo "node absent"; exit 1; }
[ -f $D/.env ] || { PW=$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 14); echo "ADMIN_PW=$PW" > $D/.env; chmod 600 $D/.env; echo "MOT DE PASSE ADMIN: $PW"; }
cat > /etc/systemd/system/hotel-server.service <<U
[Unit]
Description=Hotel game server
After=network.target
[Service]
EnvironmentFile=$D/.env
Environment=DATA_DIR=$D
ExecStart=$(command -v node) $D/server.js
Restart=always
User=root
[Install]
WantedBy=multi-user.target
U
systemctl daemon-reload; systemctl enable hotel-server; systemctl restart hotel-server; sleep 1
curl -s http://127.0.0.1:8099/health; echo
CF=/etc/caddy/Caddyfile
if [ -f $CF ] && ! grep -q "hotel-api.assoulineweb.com" $CF; then
 cp $CF $CF.bak-hotel; printf '\nhotel-api.assoulineweb.com {\n  reverse_proxy 127.0.0.1:8099\n}\n' >> $CF; systemctl reload caddy && echo "Caddy OK"
fi
echo "FINI. Admin: https://hotel-api.assoulineweb.com/admin"
