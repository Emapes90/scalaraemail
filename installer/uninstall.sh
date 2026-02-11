#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Uninstaller
#  Removes Scalara and all related services
#
#  Usage: sudo bash uninstall.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
NC='\033[0m'

echo -e "${RED}${WHITE}"
echo "╔══════════════════════════════════════════════╗"
echo "║       Scalara Uninstaller                    ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}This script must be run as root${NC}"
    exit 1
fi

echo -e "${YELLOW}WARNING: This will remove Scalara and all its data!${NC}"
echo -e "${YELLOW}This includes: Webmail, Postfix, Dovecot, PostgreSQL data, and all emails.${NC}"
echo ""
read -rp "Are you sure? Type 'UNINSTALL' to confirm: " confirm

if [[ "${confirm}" != "UNINSTALL" ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""

# Stop services
echo -e "${YELLOW}Stopping services...${NC}"
pm2 stop scalara 2>/dev/null || true
pm2 delete scalara 2>/dev/null || true
systemctl stop postfix 2>/dev/null || true
systemctl stop dovecot 2>/dev/null || true
systemctl stop opendkim 2>/dev/null || true
systemctl stop nginx 2>/dev/null || true

# Remove Scalara files
echo -e "${YELLOW}Removing Scalara files...${NC}"
rm -rf /opt/scalara

# Remove Nginx config
rm -f /etc/nginx/sites-available/scalara
rm -f /etc/nginx/sites-enabled/scalara

# Remove database
echo -e "${YELLOW}Removing database...${NC}"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS scalara;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS scalara;" 2>/dev/null || true

# Remove mail data
echo -e "${YELLOW}Removing mail data...${NC}"
rm -rf /var/mail/vhosts

# Remove scalara user
userdel -r scalara 2>/dev/null || true

# Remove log
rm -f /var/log/scalara-install.log

# Remove DKIM keys
rm -rf /etc/opendkim/keys

echo ""
echo -e "${GREEN}Scalara has been uninstalled.${NC}"
echo -e "${YELLOW}Note: Postfix, Dovecot, PostgreSQL, Nginx, and Node.js packages were NOT removed.${NC}"
echo -e "${YELLOW}To remove them: apt-get remove postfix dovecot-core postgresql nginx nodejs${NC}"
