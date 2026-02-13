#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Admin — Email Hosting Management Tool
#  Manage email accounts, DNS, services, and configurations
#
#  No Node.js required — uses Python3 + psql directly
#
#  Usage: sudo scalara-admin
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Constants ───────────────────────────────────────────────
readonly SCALARA_HOME="/opt/scalara"
readonly CONFIG_DIR="${SCALARA_HOME}/config"

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Root Check ─────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}This script must be run as root (use sudo)${NC}"
    exit 1
fi

# ─── Load Config ─────────────────────────────────────────────
if [[ -f "${CONFIG_DIR}/engine.env" ]]; then
    set -a
    source "${CONFIG_DIR}/engine.env"
    set +a
fi

MAIL_DOMAIN="${MAIL_DOMAIN:-}"
MAIL_HOSTNAME="${MAIL_HOSTNAME:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

if [[ -z "${MAIL_DOMAIN}" ]]; then
    MAIL_DOMAIN=$(hostname -d 2>/dev/null || hostname | sed 's/^[^.]*\.//')
fi
if [[ -z "${MAIL_HOSTNAME}" ]]; then
    MAIL_HOSTNAME="mail.${MAIL_DOMAIN}"
fi

DB_NAME="scalara"
DB_USER="scalara"

# ─── Helper Functions ────────────────────────────────────────
print_header() {
    clear
    echo -e "${WHITE}${BOLD}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║         Scalara Admin Panel                  ║"
    echo "║         Email Hosting Management             ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "  Domain: ${GREEN}${MAIL_DOMAIN}${NC}"
    echo -e "  Server: ${GREEN}${MAIL_HOSTNAME}${NC}"
    echo ""
}

print_menu() {
    echo -e "${CYAN}${BOLD}━━━ Main Menu ━━━${NC}"
    echo ""
    echo -e "  ${WHITE}Email Accounts${NC}"
    echo -e "    ${GREEN}1${NC}  Create Email Account"
    echo -e "    ${GREEN}2${NC}  Delete Email Account"
    echo -e "    ${GREEN}3${NC}  List Email Accounts"
    echo -e "    ${GREEN}4${NC}  Change Email Password"
    echo -e "    ${GREEN}5${NC}  Change Email Quota"
    echo ""
    echo -e "  ${WHITE}Server Management${NC}"
    echo -e "    ${GREEN}6${NC}  Service Status"
    echo -e "    ${GREEN}7${NC}  Restart Services"
    echo -e "    ${GREEN}8${NC}  View Logs"
    echo ""
    echo -e "  ${WHITE}DNS & Configuration${NC}"
    echo -e "    ${GREEN}9${NC}  Show DNS Records"
    echo -e "    ${GREEN}10${NC} Verify DNS Setup"
    echo -e "    ${GREEN}11${NC} SSL Certificate Status"
    echo -e "    ${GREEN}12${NC} Renew SSL Certificates"
    echo ""
    echo -e "  ${WHITE}Maintenance${NC}"
    echo -e "    ${GREEN}13${NC} Server Info & Disk Usage"
    echo -e "    ${GREEN}14${NC} Backup"
    echo -e "    ${GREEN}15${NC} Test Email Sending"
    echo -e "    ${GREEN}16${NC} Add New Domain"
    echo -e "    ${GREEN}17${NC} Show Webmail Env Vars"
    echo ""
    echo -e "    ${RED}0${NC}   Exit"
    echo ""
}

pause() {
    echo ""
    read -rp "$(echo -e "${CYAN}Press Enter to continue...${NC}")"
}

db_query() {
    if [[ -n "${DB_PASSWORD}" ]]; then
        PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "$1" 2>/dev/null
    else
        sudo -u postgres psql -d "${DB_NAME}" -t -A -c "$1" 2>/dev/null
    fi
}

# ─── Password / Encryption (Python3, no Node.js) ────────────
hash_password_pbkdf2() {
    local password="$1"
    echo -n "${password}" | python3 -c "
import hashlib, os, sys
pwd = sys.stdin.buffer.read()
salt = os.urandom(32)
h = hashlib.pbkdf2_hmac('sha512', pwd, salt, 100000, dklen=64)
print(salt.hex() + ':' + h.hex())
"
}

encrypt_aes256gcm() {
    local plaintext="$1"
    local key_hex="$2"
    python3 -c "
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
plaintext = b'$(echo -n "${plaintext}" | sed "s/'/\\\\'/g")'
key = bytes.fromhex('${key_hex}')
iv = os.urandom(16)
aesgcm = AESGCM(key)
ct = aesgcm.encrypt(iv, plaintext, None)
ciphertext = ct[:-16]
auth_tag = ct[-16:]
print(iv.hex() + ':' + auth_tag.hex() + ':' + ciphertext.hex())
"
}

# ─── 1. Create Email Account ────────────────────────────────
create_email() {
    echo -e "\n${CYAN}${BOLD}━━━ Create Email Account ━━━${NC}\n"

    read -rp "$(echo -e "${WHITE}Email username (before @):${NC} ")" username
    if [[ -z "${username}" ]]; then
        echo -e "${RED}Username cannot be empty${NC}"
        return
    fi

    username=$(echo "${username}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9._-')
    local email="${username}@${MAIL_DOMAIN}"

    local exists
    exists=$(db_query "SELECT COUNT(*) FROM users WHERE email='${email}';")
    if [[ "${exists}" -gt 0 ]]; then
        echo -e "${RED}Email ${email} already exists!${NC}"
        return
    fi

    read -rp "$(echo -e "${WHITE}Display name [${username}]:${NC} ")" display_name
    display_name="${display_name:-${username}}"

    while true; do
        read -srp "$(echo -e "${WHITE}Password (min 8 chars):${NC} ")" password
        echo
        if [[ ${#password} -ge 8 ]]; then break; fi
        echo -e "${YELLOW}Password must be at least 8 characters${NC}"
    done

    # Create maildir
    local maildir="/var/mail/vhosts/${MAIL_DOMAIN}/${username}"
    mkdir -p "${maildir}"/{cur,new,tmp}
    mkdir -p "${maildir}"/.Sent/{cur,new,tmp}
    mkdir -p "${maildir}"/.Drafts/{cur,new,tmp}
    mkdir -p "${maildir}"/.Trash/{cur,new,tmp}
    mkdir -p "${maildir}"/.Junk/{cur,new,tmp}
    mkdir -p "${maildir}"/.Archive/{cur,new,tmp}
    chown -R vmail:vmail "${maildir}"
    chmod -R 700 "${maildir}"

    # Add to virtual mailbox maps
    echo "${email}    ${MAIL_DOMAIN}/${username}/" >> /etc/postfix/virtual_mailbox_maps 2>/dev/null || true
    postmap /etc/postfix/virtual_mailbox_maps 2>/dev/null || true

    # Add to Dovecot users (passwd-file)
    local dovecot_pass
    dovecot_pass=$(doveadm pw -s SHA512-CRYPT -p "${password}" 2>/dev/null || echo "")
    if [[ -n "${dovecot_pass}" ]]; then
        sed -i "/^${email}:/d" /etc/dovecot/users 2>/dev/null || true
        echo "${email}:${dovecot_pass}:5000:5000::${maildir}::" >> /etc/dovecot/users 2>/dev/null || true
    fi

    # Hash password (PBKDF2) and encrypt mail password (AES-256-GCM)
    echo -e "${YELLOW}Hashing password...${NC}"
    local password_hash
    password_hash=$(hash_password_pbkdf2 "${password}")

    local encrypted_password=""
    if [[ -n "${ENCRYPTION_KEY}" ]]; then
        echo -e "${YELLOW}Encrypting mail password...${NC}"
        encrypted_password=$(encrypt_aes256gcm "${password}" "${ENCRYPTION_KEY}")
    else
        echo -e "${YELLOW}Warning: ENCRYPTION_KEY not found, using placeholder${NC}"
        encrypted_password="not-encrypted"
    fi

    # Insert into database
    db_query "INSERT INTO users (id, email, name, password_hash, imap_host, imap_port, smtp_host, smtp_port, mail_password)
        VALUES (
            '$(openssl rand -hex 12)',
            '${email}',
            '${display_name}',
            '${password_hash}',
            '${MAIL_HOSTNAME}',
            993,
            '${MAIL_HOSTNAME}',
            587,
            '${encrypted_password}'
        ) ON CONFLICT (email) DO NOTHING;" 2>/dev/null

    postfix reload 2>/dev/null || true
    systemctl reload dovecot 2>/dev/null || true

    echo -e "\n${GREEN}${BOLD}✓ Email account created!${NC}"
    echo -e "  Email:    ${GREEN}${email}${NC}"
    echo -e "  Name:     ${GREEN}${display_name}${NC}"
    echo -e "  IMAP:     ${GREEN}${MAIL_HOSTNAME}:993 (SSL)${NC}"
    echo -e "  SMTP:     ${GREEN}${MAIL_HOSTNAME}:587 (STARTTLS)${NC}"
}

# ─── 2. Delete Email Account ────────────────────────────────
delete_email() {
    echo -e "\n${CYAN}${BOLD}━━━ Delete Email Account ━━━${NC}\n"

    echo -e "${WHITE}Existing accounts:${NC}"
    db_query "SELECT email FROM users ORDER BY email;" | while read -r email; do
        echo -e "  ${GREEN}${email}${NC}"
    done
    echo ""

    read -rp "$(echo -e "${WHITE}Email to delete:${NC} ")" email
    if [[ -z "${email}" ]]; then
        echo -e "${RED}Email cannot be empty${NC}"
        return
    fi
    if [[ "${email}" != *@* ]]; then
        email="${email}@${MAIL_DOMAIN}"
    fi

    local exists
    exists=$(db_query "SELECT COUNT(*) FROM users WHERE email='${email}';")
    if [[ "${exists}" -eq 0 ]]; then
        echo -e "${RED}Email ${email} does not exist!${NC}"
        return
    fi

    read -rp "$(echo -e "${RED}Are you sure you want to delete ${email}? (yes/no):${NC} ")" confirm
    if [[ "${confirm}" != "yes" ]]; then
        echo "Cancelled."
        return
    fi

    local username
    username=$(echo "${email}" | cut -d@ -f1)

    db_query "DELETE FROM users WHERE email='${email}';" 2>/dev/null || true

    if [[ -f /etc/dovecot/users ]]; then
        sed -i "/^${email}:/d" /etc/dovecot/users 2>/dev/null || true
    fi

    if [[ -f /etc/postfix/virtual_mailbox_maps ]]; then
        sed -i "/^${email}/d" /etc/postfix/virtual_mailbox_maps 2>/dev/null || true
        postmap /etc/postfix/virtual_mailbox_maps 2>/dev/null || true
    fi

    read -rp "$(echo -e "${YELLOW}Delete mailbox data too? (yes/no):${NC} ")" del_mail
    if [[ "${del_mail}" == "yes" ]]; then
        rm -rf "/var/mail/vhosts/${MAIL_DOMAIN}/${username}"
        echo -e "${GREEN}Mailbox data deleted${NC}"
    fi

    postfix reload 2>/dev/null || true
    systemctl reload dovecot 2>/dev/null || true

    echo -e "${GREEN}${BOLD}✓ Email account ${email} deleted!${NC}"
}

# ─── 3. List Email Accounts ─────────────────────────────────
list_emails() {
    echo -e "\n${CYAN}${BOLD}━━━ Email Accounts ━━━${NC}\n"

    echo -e "${WHITE}${BOLD}  Email                          Name                  Last Login${NC}"
    echo -e "  ──────────────────────────────  ────────────────────  ──────────────────"

    db_query "SELECT email, COALESCE(name, '-'), COALESCE(TO_CHAR(last_login_at, 'YYYY-MM-DD HH24:MI'), 'Never') FROM users ORDER BY email;" | while IFS='|' read -r email name last_login; do
        printf "  ${GREEN}%-30s${NC}  %-20s  %s\n" "${email}" "${name}" "${last_login}"
    done

    local total
    total=$(db_query "SELECT COUNT(*) FROM users;")
    echo ""
    echo -e "  ${WHITE}Total accounts: ${GREEN}${total}${NC}"

    echo ""
    echo -e "${WHITE}${BOLD}  Mailbox Sizes:${NC}"
    if [[ -d "/var/mail/vhosts/${MAIL_DOMAIN}" ]]; then
        du -sh "/var/mail/vhosts/${MAIL_DOMAIN}"/*/ 2>/dev/null | while read -r size dir; do
            local user
            user=$(basename "${dir}")
            printf "  ${GREEN}%-30s${NC}  %s\n" "${user}@${MAIL_DOMAIN}" "${size}"
        done
    else
        echo -e "  ${YELLOW}No mailboxes found${NC}"
    fi
}

# ─── 4. Change Email Password ───────────────────────────────
change_password() {
    echo -e "\n${CYAN}${BOLD}━━━ Change Email Password ━━━${NC}\n"

    read -rp "$(echo -e "${WHITE}Email address:${NC} ")" email
    if [[ "${email}" != *@* ]]; then
        email="${email}@${MAIL_DOMAIN}"
    fi

    local exists
    exists=$(db_query "SELECT COUNT(*) FROM users WHERE email='${email}';")
    if [[ "${exists}" -eq 0 ]]; then
        echo -e "${RED}Email ${email} does not exist!${NC}"
        return
    fi

    while true; do
        read -srp "$(echo -e "${WHITE}New password (min 8 chars):${NC} ")" new_password
        echo
        if [[ ${#new_password} -ge 8 ]]; then break; fi
        echo -e "${YELLOW}Password must be at least 8 characters${NC}"
    done

    local username
    username=$(echo "${email}" | cut -d@ -f1)
    local domain
    domain=$(echo "${email}" | cut -d@ -f2)

    # Update Dovecot
    if [[ -f /etc/dovecot/users ]]; then
        local dovecot_pass
        dovecot_pass=$(doveadm pw -s SHA512-CRYPT -p "${new_password}" 2>/dev/null || echo "")
        if [[ -n "${dovecot_pass}" ]]; then
            sed -i "/^${email}:/d" /etc/dovecot/users 2>/dev/null || true
            local maildir="/var/mail/vhosts/${domain}/${username}"
            echo "${email}:${dovecot_pass}:5000:5000::${maildir}::" >> /etc/dovecot/users
        fi
    fi

    # Update database
    echo -e "${YELLOW}Hashing new password...${NC}"
    local new_hash
    new_hash=$(hash_password_pbkdf2 "${new_password}")

    local new_encrypted=""
    if [[ -n "${ENCRYPTION_KEY}" ]]; then
        echo -e "${YELLOW}Encrypting new mail password...${NC}"
        new_encrypted=$(encrypt_aes256gcm "${new_password}" "${ENCRYPTION_KEY}")
    fi

    if [[ -n "${new_encrypted}" ]]; then
        db_query "UPDATE users SET password_hash='${new_hash}', mail_password='${new_encrypted}', updated_at=CURRENT_TIMESTAMP WHERE email='${email}';"
    else
        db_query "UPDATE users SET password_hash='${new_hash}', updated_at=CURRENT_TIMESTAMP WHERE email='${email}';"
    fi

    systemctl reload dovecot 2>/dev/null || true
    echo -e "${GREEN}${BOLD}✓ Password changed for ${email}!${NC}"
}

# ─── 5. Change Email Quota ──────────────────────────────────
change_quota() {
    echo -e "\n${CYAN}${BOLD}━━━ Change Email Quota ━━━${NC}\n"

    read -rp "$(echo -e "${WHITE}Email address:${NC} ")" email
    if [[ "${email}" != *@* ]]; then
        email="${email}@${MAIL_DOMAIN}"
    fi

    echo -e "${WHITE}Quota plugin status:${NC}"
    if grep -q "quota" /etc/dovecot/conf.d/*.conf 2>/dev/null; then
        echo -e "  ${GREEN}Quota plugin is enabled${NC}"
    else
        echo -e "  ${YELLOW}Quota plugin not configured${NC}"
        echo -e "  To enable: add to /etc/dovecot/conf.d/90-quota.conf:"
        echo -e "  ${CYAN}plugin { quota = maildir:User quota; quota_rule = *:storage=1G }${NC}"
    fi

    local username
    username=$(echo "${email}" | cut -d@ -f1)
    local maildir="/var/mail/vhosts/${MAIL_DOMAIN}/${username}"
    if [[ -d "${maildir}" ]]; then
        local size
        size=$(du -sh "${maildir}" 2>/dev/null | awk '{print $1}')
        echo -e "  Current mailbox size: ${GREEN}${size}${NC}"
    fi
}

# ─── 6. Service Status ──────────────────────────────────────
service_status() {
    echo -e "\n${CYAN}${BOLD}━━━ Service Status ━━━${NC}\n"

    local services=("postfix" "dovecot" "postgresql" "opendkim" "fail2ban")

    for svc in "${services[@]}"; do
        if systemctl is-active --quiet "${svc}" 2>/dev/null; then
            echo -e "  ${GREEN}●${NC} ${WHITE}${svc}${NC} — running"
        elif systemctl is-enabled --quiet "${svc}" 2>/dev/null; then
            echo -e "  ${RED}●${NC} ${WHITE}${svc}${NC} — stopped (enabled)"
        else
            echo -e "  ${YELLOW}○${NC} ${WHITE}${svc}${NC} — not installed"
        fi
    done

    echo ""
    echo -e "  ${WHITE}Open Ports:${NC}"
    for port in 25 143 443 587 993 5432; do
        if ss -tlnp | grep -q ":${port} "; then
            local process
            process=$(ss -tlnp | grep ":${port} " | head -1 | grep -oP 'users:\(\("\K[^"]+' || echo "unknown")
            echo -e "    ${GREEN}●${NC} Port ${port} — ${process}"
        else
            echo -e "    ${RED}○${NC} Port ${port} — closed"
        fi
    done
}

# ─── 7. Restart Services ────────────────────────────────────
restart_services() {
    echo -e "\n${CYAN}${BOLD}━━━ Restart Services ━━━${NC}\n"

    echo -e "  ${GREEN}1${NC}  Restart All Services"
    echo -e "  ${GREEN}2${NC}  Restart Postfix (SMTP)"
    echo -e "  ${GREEN}3${NC}  Restart Dovecot (IMAP)"
    echo -e "  ${GREEN}4${NC}  Restart PostgreSQL"
    echo -e "  ${GREEN}5${NC}  Restart OpenDKIM"
    echo -e "  ${GREEN}0${NC}  Back"
    echo ""

    read -rp "$(echo -e "${WHITE}Choose option:${NC} ")" choice

    case "${choice}" in
        1)
            echo -e "${YELLOW}Restarting all services...${NC}"
            systemctl restart postfix && echo -e "  ${GREEN}✓ Postfix${NC}" || echo -e "  ${RED}✗ Postfix${NC}"
            systemctl restart dovecot && echo -e "  ${GREEN}✓ Dovecot${NC}" || echo -e "  ${RED}✗ Dovecot${NC}"
            systemctl restart postgresql && echo -e "  ${GREEN}✓ PostgreSQL${NC}" || echo -e "  ${RED}✗ PostgreSQL${NC}"
            systemctl restart opendkim 2>/dev/null && echo -e "  ${GREEN}✓ OpenDKIM${NC}" || true
            echo -e "${GREEN}${BOLD}✓ All services restarted!${NC}"
            ;;
        2) systemctl restart postfix && echo -e "${GREEN}✓ Postfix restarted${NC}" ;;
        3) systemctl restart dovecot && echo -e "${GREEN}✓ Dovecot restarted${NC}" ;;
        4) systemctl restart postgresql && echo -e "${GREEN}✓ PostgreSQL restarted${NC}" ;;
        5) systemctl restart opendkim && echo -e "${GREEN}✓ OpenDKIM restarted${NC}" ;;
        0) return ;;
    esac
}

# ─── 8. View Logs ───────────────────────────────────────────
view_logs() {
    echo -e "\n${CYAN}${BOLD}━━━ View Logs ━━━${NC}\n"

    echo -e "  ${GREEN}1${NC}  Postfix Logs (SMTP)"
    echo -e "  ${GREEN}2${NC}  Dovecot Logs (IMAP)"
    echo -e "  ${GREEN}3${NC}  Mail Log (combined)"
    echo -e "  ${GREEN}4${NC}  PostgreSQL Logs"
    echo -e "  ${GREEN}5${NC}  Fail2Ban Log"
    echo -e "  ${GREEN}0${NC}  Back"
    echo ""

    read -rp "$(echo -e "${WHITE}Choose option:${NC} ")" choice

    echo -e "\n${YELLOW}Showing last 50 lines...${NC}\n"

    case "${choice}" in
        1) journalctl -u postfix --lines 50 --no-pager 2>/dev/null || tail -50 /var/log/mail.log 2>/dev/null ;;
        2) journalctl -u dovecot --lines 50 --no-pager 2>/dev/null || tail -50 /var/log/mail.log 2>/dev/null ;;
        3) tail -50 /var/log/mail.log 2>/dev/null || journalctl -u postfix -u dovecot --lines 50 --no-pager ;;
        4) journalctl -u postgresql --lines 50 --no-pager 2>/dev/null ;;
        5) tail -50 /var/log/fail2ban.log 2>/dev/null || echo "No Fail2Ban logs" ;;
        0) return ;;
    esac
}

# ─── 9. Show DNS Records ────────────────────────────────────
show_dns() {
    echo -e "\n${CYAN}${BOLD}━━━ Required DNS Records ━━━${NC}\n"

    local server_ip
    server_ip=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

    echo -e "${WHITE}${BOLD}Add these records to Cloudflare / your registrar:${NC}\n"

    echo -e "  ${CYAN}Type   Host                               Value${NC}"
    echo -e "  ────── ──────────────────────────────────── ────────────────────────────────────────"
    echo -e "  ${GREEN}A${NC}      ${MAIL_HOSTNAME}                ${server_ip}"
    echo -e "  ${GREEN}MX${NC}     ${MAIL_DOMAIN}                     ${MAIL_HOSTNAME} (Priority: 10)"
    echo -e "  ${GREEN}TXT${NC}    ${MAIL_DOMAIN}                     \"v=spf1 mx a:${MAIL_HOSTNAME} ~all\""
    echo -e "  ${GREEN}TXT${NC}    _dmarc.${MAIL_DOMAIN}              \"v=DMARC1; p=quarantine; rua=mailto:admin@${MAIL_DOMAIN}\""

    if [[ -f "/etc/opendkim/keys/${MAIL_DOMAIN}/scalara.txt" ]]; then
        echo ""
        echo -e "  ${GREEN}TXT${NC}    scalara._domainkey.${MAIL_DOMAIN}"
        echo -e "         $(cat /etc/opendkim/keys/${MAIL_DOMAIN}/scalara.txt 2>/dev/null | tr -d '\n' | sed 's/\s\+/ /g')"
    fi

    echo ""
    echo -e "  ${GREEN}PTR${NC}    ${server_ip}                       ${MAIL_HOSTNAME}"
    echo -e "         ${YELLOW}(Set via VPS provider control panel)${NC}"
}

# ─── 10. Verify DNS Setup ───────────────────────────────────
verify_dns() {
    echo -e "\n${CYAN}${BOLD}━━━ DNS Verification ━━━${NC}\n"

    if ! command -v dig &>/dev/null; then
        echo -e "${RED}dig not found. Install: apt install dnsutils${NC}"
        return
    fi

    local server_ip
    server_ip=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

    echo -e "${WHITE}A Record:${NC}"
    local ip
    ip=$(dig +short A "${MAIL_HOSTNAME}" 2>/dev/null | head -1)
    if [[ "${ip}" == "${server_ip}" ]]; then
        echo -e "  ${GREEN}✓${NC} ${MAIL_HOSTNAME} → ${ip}"
    elif [[ -n "${ip}" ]]; then
        echo -e "  ${YELLOW}!${NC} ${MAIL_HOSTNAME} → ${ip} (expected: ${server_ip})"
    else
        echo -e "  ${RED}✗${NC} ${MAIL_HOSTNAME} — Not configured"
    fi

    echo -e "\n${WHITE}MX Record:${NC}"
    local mx
    mx=$(dig +short MX "${MAIL_DOMAIN}" 2>/dev/null | head -1)
    if [[ -n "${mx}" ]]; then
        echo -e "  ${GREEN}✓${NC} ${MAIL_DOMAIN} → ${mx}"
    else
        echo -e "  ${RED}✗${NC} No MX record"
    fi

    echo -e "\n${WHITE}SPF Record:${NC}"
    local spf
    spf=$(dig +short TXT "${MAIL_DOMAIN}" 2>/dev/null | grep "spf")
    if [[ -n "${spf}" ]]; then
        echo -e "  ${GREEN}✓${NC} ${spf}"
    else
        echo -e "  ${RED}✗${NC} No SPF record"
    fi

    echo -e "\n${WHITE}DMARC Record:${NC}"
    local dmarc
    dmarc=$(dig +short TXT "_dmarc.${MAIL_DOMAIN}" 2>/dev/null | head -1)
    if [[ -n "${dmarc}" ]]; then
        echo -e "  ${GREEN}✓${NC} ${dmarc}"
    else
        echo -e "  ${RED}✗${NC} No DMARC record"
    fi

    echo -e "\n${WHITE}DKIM Record:${NC}"
    local dkim
    dkim=$(dig +short TXT "scalara._domainkey.${MAIL_DOMAIN}" 2>/dev/null | head -1)
    if [[ -n "${dkim}" ]]; then
        echo -e "  ${GREEN}✓${NC} DKIM found"
    else
        echo -e "  ${RED}✗${NC} No DKIM record"
    fi

    echo -e "\n${WHITE}PTR Record:${NC}"
    local ptr
    ptr=$(dig +short -x "${server_ip}" 2>/dev/null | head -1)
    if [[ -n "${ptr}" ]]; then
        echo -e "  ${GREEN}✓${NC} ${server_ip} → ${ptr}"
    else
        echo -e "  ${RED}✗${NC} No PTR record — Set via VPS provider"
    fi
}

# ─── 11. SSL Certificate Status ─────────────────────────────
ssl_status() {
    echo -e "\n${CYAN}${BOLD}━━━ SSL Certificate Status ━━━${NC}\n"

    if command -v certbot &>/dev/null; then
        certbot certificates 2>/dev/null || echo -e "${YELLOW}No certificates found${NC}"
    else
        echo -e "${YELLOW}Certbot not installed${NC}"
    fi

    echo ""
    echo -e "${WHITE}${MAIL_HOSTNAME}:${NC}"
    local expiry
    expiry=$(echo | openssl s_client -servername "${MAIL_HOSTNAME}" -connect "${MAIL_HOSTNAME}:993" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [[ -n "${expiry}" ]]; then
        echo -e "  IMAP SSL expires: ${GREEN}${expiry}${NC}"
    else
        echo -e "  ${YELLOW}Could not check (DNS may not be configured)${NC}"
    fi
}

# ─── 12. Renew SSL Certificates ─────────────────────────────
renew_ssl() {
    echo -e "\n${CYAN}${BOLD}━━━ Renew SSL Certificates ━━━${NC}\n"

    if ! command -v certbot &>/dev/null; then
        echo -e "${RED}Certbot not installed${NC}"
        return
    fi

    echo -e "${YELLOW}Testing renewal...${NC}"
    certbot renew --dry-run 2>&1 | tail -10

    echo ""
    read -rp "$(echo -e "${WHITE}Proceed with renewal? (y/n):${NC} ")" confirm
    if [[ "${confirm}" == "y" || "${confirm}" == "Y" ]]; then
        certbot renew 2>&1 | tail -20
        systemctl reload postfix 2>/dev/null || true
        systemctl reload dovecot 2>/dev/null || true
        echo -e "${GREEN}✓ SSL renewed and services reloaded${NC}"
    fi
}

# ─── 13. Server Info ────────────────────────────────────────
server_info() {
    echo -e "\n${CYAN}${BOLD}━━━ Server Information ━━━${NC}\n"

    echo -e "  ${WHITE}Hostname:${NC}   $(hostname)"
    echo -e "  ${WHITE}OS:${NC}         $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
    echo -e "  ${WHITE}Kernel:${NC}     $(uname -r)"
    echo -e "  ${WHITE}Uptime:${NC}     $(uptime -p)"
    echo -e "  ${WHITE}Public IP:${NC}  $(curl -4 -s ifconfig.me 2>/dev/null || echo 'N/A')"

    echo ""
    echo -e "  ${WHITE}CPU:${NC}        $(nproc) cores"
    echo -e "  ${WHITE}RAM:${NC}        $(free -h | awk '/Mem:/ {printf "%s / %s (%s used)", $3, $2, $3}')"
    echo -e "  ${WHITE}Swap:${NC}       $(free -h | awk '/Swap:/ {printf "%s / %s", $3, $2}')"

    echo ""
    echo -e "  ${WHITE}Disk:${NC}"
    df -h / | awk 'NR==2 {printf "    Root: %s / %s (%s used)\n", $3, $2, $5}'
    if [[ -d /var/mail ]]; then
        echo -e "    Mail: $(du -sh /var/mail 2>/dev/null | awk '{print $1}')"
    fi

    echo ""
    echo -e "  ${WHITE}Database:${NC}"
    local db_size
    db_size=$(db_query "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" 2>/dev/null || echo "N/A")
    echo -e "    Size: ${db_size}"
}

# ─── 14. Backup ─────────────────────────────────────────────
backup_emails() {
    echo -e "\n${CYAN}${BOLD}━━━ Backup ━━━${NC}\n"

    local backup_dir="/opt/scalara/backups"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${backup_dir}/scalara-backup-${timestamp}.tar.gz"

    mkdir -p "${backup_dir}"
    echo -e "${YELLOW}Creating backup...${NC}"

    # Database dump
    local db_dump="${backup_dir}/db-${timestamp}.sql"
    if [[ -n "${DB_PASSWORD}" ]]; then
        PGPASSWORD="${DB_PASSWORD}" pg_dump -h localhost -U "${DB_USER}" "${DB_NAME}" > "${db_dump}" 2>/dev/null
    else
        sudo -u postgres pg_dump "${DB_NAME}" > "${db_dump}" 2>/dev/null
    fi
    echo -e "  ${GREEN}✓${NC} Database dumped"

    tar -czf "${backup_file}" \
        -C / \
        var/mail/vhosts 2>/dev/null \
        "${db_dump}" \
        etc/postfix/main.cf 2>/dev/null \
        etc/dovecot 2>/dev/null \
        opt/scalara/config 2>/dev/null \
        || true

    rm -f "${db_dump}"

    local size
    size=$(du -sh "${backup_file}" | awk '{print $1}')
    echo -e "\n${GREEN}${BOLD}✓ Backup created!${NC}"
    echo -e "  File: ${CYAN}${backup_file}${NC}"
    echo -e "  Size: ${GREEN}${size}${NC}"
}

# ─── 15. Test Email Sending ─────────────────────────────────
test_email() {
    echo -e "\n${CYAN}${BOLD}━━━ Test Email Sending ━━━${NC}\n"

    read -rp "$(echo -e "${WHITE}Send test email to:${NC} ")" to_email
    if [[ -z "${to_email}" ]]; then
        echo -e "${RED}Email address required${NC}"
        return
    fi

    echo -e "${YELLOW}Sending test email...${NC}"

    echo "Subject: Scalara Test Email
From: admin@${MAIL_DOMAIN}
To: ${to_email}
Date: $(date -R)

This is a test email from your Scalara mail server.
Server: ${MAIL_HOSTNAME}
Time: $(date)

If you received this, your mail server is working!" | sendmail "${to_email}" 2>&1

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}✓ Test email sent to ${to_email}!${NC}"
        echo -e "  Check inbox (and spam folder)"
    else
        echo -e "${RED}Failed to send${NC}"
    fi
}

# ─── 16. Add New Domain ─────────────────────────────────────
add_domain() {
    echo -e "\n${CYAN}${BOLD}━━━ Add New Domain ━━━${NC}\n"

    read -rp "$(echo -e "${WHITE}New domain name:${NC} ")" new_domain
    if [[ -z "${new_domain}" ]]; then
        echo -e "${RED}Domain cannot be empty${NC}"
        return
    fi

    if ! grep -q "^${new_domain}$" /etc/postfix/virtual_mailbox_domains 2>/dev/null; then
        echo "${new_domain}" >> /etc/postfix/virtual_mailbox_domains
        postmap /etc/postfix/virtual_mailbox_domains 2>/dev/null || true
        echo -e "${GREEN}✓ Domain added to Postfix${NC}"
    else
        echo -e "${YELLOW}Domain already exists${NC}"
    fi

    mkdir -p "/var/mail/vhosts/${new_domain}"
    chown -R vmail:vmail "/var/mail/vhosts/${new_domain}"
    postfix reload 2>/dev/null || true

    local server_ip
    server_ip=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

    echo ""
    echo -e "${WHITE}${BOLD}Add these DNS records for ${new_domain}:${NC}"
    echo -e "  ${GREEN}A${NC}      mail.${new_domain}        → ${server_ip}"
    echo -e "  ${GREEN}MX${NC}     ${new_domain}              → mail.${new_domain} (Priority: 10)"
    echo -e "  ${GREEN}TXT${NC}    ${new_domain}              → \"v=spf1 mx a:mail.${new_domain} ~all\""
    echo -e "  ${GREEN}TXT${NC}    _dmarc.${new_domain}       → \"v=DMARC1; p=quarantine\""
    echo ""
    echo -e "${GREEN}${BOLD}✓ Domain ${new_domain} added!${NC}"
}

# ─── 17. Show Webmail Env Vars ──────────────────────────────
show_webmail_env() {
    echo -e "\n${CYAN}${BOLD}━━━ Webmail Environment Variables ━━━${NC}\n"

    if [[ -f "${CONFIG_DIR}/webmail.env" ]]; then
        echo -e "${WHITE}Copy these to your Vercel project settings:${NC}\n"
        cat "${CONFIG_DIR}/webmail.env"
    else
        echo -e "${YELLOW}webmail.env not found at ${CONFIG_DIR}/webmail.env${NC}"
        echo -e "${WHITE}Re-run the installer to generate it${NC}"
    fi
}

# ═══════════════════════════════════════════════════════
#  Main Menu Loop
# ═══════════════════════════════════════════════════════
main() {
    while true; do
        print_header
        print_menu

        read -rp "$(echo -e "${WHITE}${BOLD}Choose option:${NC} ")" choice

        case "${choice}" in
            1)  create_email ;;
            2)  delete_email ;;
            3)  list_emails ;;
            4)  change_password ;;
            5)  change_quota ;;
            6)  service_status ;;
            7)  restart_services ;;
            8)  view_logs ;;
            9)  show_dns ;;
            10) verify_dns ;;
            11) ssl_status ;;
            12) renew_ssl ;;
            13) server_info ;;
            14) backup_emails ;;
            15) test_email ;;
            16) add_domain ;;
            17) show_webmail_env ;;
            0)
                echo -e "\n${GREEN}Goodbye!${NC}\n"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac

        pause
    done
}

main "$@"
