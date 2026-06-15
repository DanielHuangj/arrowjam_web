#!/usr/bin/env bash
# 有域名时在 VPS 上申请 HTTPS（Certbot）
# 用法: DOMAIN=your-domain.com bash setup-https.sh
set -euo pipefail

DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" || "$DOMAIN" == "your-domain.com" ]]; then
  echo "请设置环境变量 DOMAIN=你的域名" >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y certbot python3-certbot-nginx
fi

sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || \
  sudo certbot --nginx -d "$DOMAIN"

echo "HTTPS 已配置: https://$DOMAIN/"
