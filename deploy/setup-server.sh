#!/usr/bin/env bash
# 在 VPS 上配置 Nginx 静态站点（需 root/sudo）
# 用法: bash setup-server.sh [域名或IP]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/arrowjam}"
DOMAIN="${1:-${DOMAIN:-_}}"
SITE_NAME="arrowjam"
CONF_SRC="${CONF_SRC:-$SCRIPT_DIR/nginx/arrowjam.conf}"
CONF_DEST="/etc/nginx/sites-available/$SITE_NAME"

if [[ ! -f "$CONF_SRC" ]]; then
  echo "找不到 $CONF_SRC" >&2
  exit 1
fi

sudo mkdir -p "$DEPLOY_PATH"
sudo chown -R www-data:www-data "$DEPLOY_PATH" 2>/dev/null || sudo chown -R nginx:nginx "$DEPLOY_PATH" 2>/dev/null || true

sudo cp "$CONF_SRC" "$CONF_DEST"
if [[ "$DOMAIN" != "_" ]]; then
  sudo sed -i "s/your-domain.com/$DOMAIN/g" "$CONF_DEST"
fi
sudo sed -i "s|/var/www/arrowjam|$DEPLOY_PATH|g" "$CONF_DEST"

sudo ln -sf "$CONF_DEST" "/etc/nginx/sites-enabled/$SITE_NAME"
sudo nginx -t
sudo systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 80 || true
  sudo ufw allow 443 || true
fi

echo "Nginx 已配置: $CONF_DEST"
echo "站点根目录: $DEPLOY_PATH"
