#!/usr/bin/env bash
# Chạy MỘT LẦN trên VPS (Ubuntu 24.04, Oracle Cloud):
#   scp deploy/setup-vps.sh deploy/Caddyfile ubuntu@146.235.22.130:/tmp/
#   ssh ubuntu@146.235.22.130 'bash /tmp/setup-vps.sh'
set -euo pipefail

echo ">> Cài Caddy"
sudo apt-get update -y
sudo apt-get install -y caddy

echo ">> Mở cổng 80/443 trong iptables (image Ubuntu của Oracle chặn sẵn)"
# Phải chèn TRƯỚC rule REJECT, nếu không gói tin bị chặn trước khi tới rule ACCEPT
for port in 443 80; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    reject_line=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    sudo iptables -I INPUT "${reject_line:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo ">> Thư mục web"
sudo mkdir -p /var/www/badrally
sudo chown -R "$USER":"$USER" /var/www/badrally

echo ">> Cấu hình Caddy"
sudo cp /tmp/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy

echo ">> Xong. Nhớ mở Ingress TCP 80, 443 trong Security List của VCN trên Oracle Console."
