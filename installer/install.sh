#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Mail Engine — VPS Auto-Installer
#  Production-grade installer for Ubuntu 22.04/24.04
#
#  Installs: PostgreSQL + Postfix + Dovecot + OpenDKIM +
#            Fail2Ban + UFW + Let's Encrypt SSL
#
#  The webmail is hosted separately (Vercel / any Node.js host)
#  and connects to this VPS engine + database remotely.
#
#  Usage: sudo bash install.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail
IFS=$'\n\t'

# ─── Constants ───────────────────────────────────────────────
readonly INSTALLER_VERSION="2.0.0"
readonly INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/scalara-install.log"
readonly SCALARA_HOME="/opt/scalara"
readonly SCALARA_USER="scalara"
readonly CONFIG_DIR="${SCALARA_HOME}/config"
readonly MIN_RAM_MB=512
readonly MIN_DISK_GB=10

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'
BOLD='\033[1m'

# ─── Source libraries ────────────────────────────────────────
source "${INSTALLER_DIR}/lib/functions.sh"
source "${INSTALLER_DIR}/lib/dns.sh"
source "${INSTALLER_DIR}/lib/ssl.sh"

# ─── Logging ─────────────────────────────────────────────────
exec > >(tee -a "${LOG_FILE}") 2>&1

log_info()    { echo -e "${BLUE}[INFO]${NC}    $(date '+%H:%M:%S') $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $(date '+%H:%M:%S') $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $(date '+%H:%M:%S') $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $(date '+%H:%M:%S') $*"; }
log_step()    { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}\n"; }

# ─── Error handler ───────────────────────────────────────────
trap 'on_error $? $LINENO' ERR

on_error() {
    local exit_code=$1
    local line_number=$2
    log_error "Installation failed at line ${line_number} with exit code ${exit_code}"
    log_error "Check ${LOG_FILE} for details"
    echo -e "\n${RED}${BOLD}Installation failed!${NC}"
    echo -e "Run ${YELLOW}sudo bash ${INSTALLER_DIR}/install.sh${NC} to retry"
    exit 1
}

# ─── Banner ──────────────────────────────────────────────────
print_banner() {
    echo -e "${WHITE}${BOLD}"
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║                                                      ║"
    echo "║     ███████╗ ██████╗ █████╗ ██╗      █████╗ ██████╗  ║"
    echo "║     ██╔════╝██╔════╝██╔══██╗██║     ██╔══██╗██╔══██╗ ║"
    echo "║     ███████╗██║     ███████║██║     ███████║██████╔╝ ║"
    echo "║     ╚════██║██║     ██╔══██║██║     ██╔══██║██╔══██╗ ║"
    echo "║     ███████║╚██████╗██║  ██║███████╗██║  ██║██║  ██║ ║"
    echo "║     ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ║"
    echo "║                                                      ║"
    echo "║        Mail Engine + Database Installer               ║"
    echo "║             Version ${INSTALLER_VERSION}                         ║"
    echo "║                                                      ║"
    echo "║  VPS = Engine (Postfix/Dovecot/DKIM) + PostgreSQL    ║"
    echo "║  Webmail = Hosted separately (Vercel / Node.js host) ║"
    echo "║                                                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ─── Pre-flight checks ──────────────────────────────────────
preflight_checks() {
    log_step "Running pre-flight checks"

    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi

    if [[ ! -f /etc/os-release ]]; then
        log_error "Unsupported operating system"
        exit 1
    fi
    source /etc/os-release
    if [[ "${ID}" != "ubuntu" && "${ID}" != "debian" ]]; then
        log_error "Only Ubuntu 22.04+ and Debian 11+ are supported"
        exit 1
    fi
    log_success "OS: ${PRETTY_NAME}"

    local total_ram
    total_ram=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    if [[ ${total_ram} -lt ${MIN_RAM_MB} ]]; then
        log_error "Minimum ${MIN_RAM_MB}MB RAM required. Found: ${total_ram}MB"
        exit 1
    fi
    log_success "RAM: ${total_ram}MB"

    local free_disk
    free_disk=$(df -BG / | awk 'NR==2 {print int($4)}')
    if [[ ${free_disk} -lt ${MIN_DISK_GB} ]]; then
        log_error "Minimum ${MIN_DISK_GB}GB free disk required. Found: ${free_disk}GB"
        exit 1
    fi
    log_success "Free disk: ${free_disk}GB"

    for port in 25 80 143 443 587 993; do
        if ss -tlnp | grep -q ":${port} "; then
            log_warn "Port ${port} is already in use"
        fi
    done
    log_success "Port checks complete"
}

# ─── Collect configuration ───────────────────────────────────
collect_config() {
    log_step "Configuration"

    echo -e "${WHITE}Please provide the following information:${NC}\n"

    # Domain
    read -rp "$(echo -e "${CYAN}Mail domain (e.g. example.com):${NC} ")" MAIL_DOMAIN
    if [[ -z "${MAIL_DOMAIN}" ]]; then
        log_error "Domain cannot be empty"
        exit 1
    fi

    # Hostname
    MAIL_HOSTNAME="mail.${MAIL_DOMAIN}"
    read -rp "$(echo -e "${CYAN}Mail hostname [${MAIL_HOSTNAME}]:${NC} ")" input
    MAIL_HOSTNAME="${input:-${MAIL_HOSTNAME}}"

    # Admin email for SSL certs
    read -rp "$(echo -e "${CYAN}Admin email for SSL certs:${NC} ")" ADMIN_EMAIL
    if [[ -z "${ADMIN_EMAIL}" ]]; then
        ADMIN_EMAIL="admin@${MAIL_DOMAIN}"
        log_warn "Using default: ${ADMIN_EMAIL}"
    fi

    # Admin password
    while true; do
        read -srp "$(echo -e "${CYAN}Admin password (min 8 chars):${NC} ")" ADMIN_PASSWORD
        echo
        if [[ ${#ADMIN_PASSWORD} -ge 8 ]]; then
            break
        fi
        log_warn "Password must be at least 8 characters"
    done

    # Webmail URL
    read -rp "$(echo -e "${CYAN}Webmail URL (e.g. https://mail.example.com or Vercel URL):${NC} ")" WEBMAIL_URL
    if [[ -z "${WEBMAIL_URL}" ]]; then
        WEBMAIL_URL="https://webmail.${MAIL_DOMAIN}"
        log_warn "Using default: ${WEBMAIL_URL}"
    fi

    # Auto-generate secrets
    DB_PASSWORD=$(generate_password 32)
    NEXTAUTH_SECRET=$(generate_password 48)
    ENCRYPTION_KEY=$(openssl rand -hex 32)

    echo ""
    echo -e "${WHITE}${BOLD}Configuration Summary:${NC}"
    echo -e "  Mail Domain:       ${GREEN}${MAIL_DOMAIN}${NC}"
    echo -e "  Mail Hostname:     ${GREEN}${MAIL_HOSTNAME}${NC}"
    echo -e "  Webmail URL:       ${GREEN}${WEBMAIL_URL}${NC}"
    echo -e "  Admin Email:       ${GREEN}${ADMIN_EMAIL}${NC}"
    echo ""
    echo -e "  ${YELLOW}Architecture:${NC}"
    echo -e "  ${WHITE}VPS${NC}  → Engine (Postfix + Dovecot + DKIM) + PostgreSQL"
    echo -e "  ${WHITE}Remote${NC} → Webmail (deployed on Vercel / Node.js host)"
    echo ""

    read -rp "$(echo -e "${YELLOW}Proceed with installation? (y/N):${NC} ")" confirm
    if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
        echo "Installation cancelled."
        exit 0
    fi
}

# ─── System Setup ────────────────────────────────────────────
setup_system() {
    log_step "Setting up system"

    log_info "Updating system packages..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get upgrade -y -qq
    log_success "System updated"

    log_info "Installing essential packages..."
    apt-get install -y -qq \
        curl wget gnupg2 ca-certificates lsb-release \
        software-properties-common apt-transport-https \
        ufw fail2ban git unzip jq openssl dnsutils \
        python3 python3-cryptography certbot
    log_success "Essential packages installed"

    log_info "Setting hostname to ${MAIL_HOSTNAME}..."
    hostnamectl set-hostname "${MAIL_HOSTNAME}"
    echo "${MAIL_HOSTNAME}" > /etc/hostname
    log_success "Hostname set"

    if ! id "${SCALARA_USER}" &>/dev/null; then
        useradd -r -m -d "${SCALARA_HOME}" -s /bin/bash "${SCALARA_USER}"
        log_success "User ${SCALARA_USER} created"
    fi

    mkdir -p "${SCALARA_HOME}" "${CONFIG_DIR}"
    chown -R "${SCALARA_USER}:${SCALARA_USER}" "${SCALARA_HOME}"
    log_success "Directories created"
}

# ─── Firewall ────────────────────────────────────────────────
setup_firewall() {
    log_step "Configuring firewall"

    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing

    ufw allow 22/tcp comment "SSH"
    ufw allow 80/tcp comment "HTTP (certbot)"
    ufw allow 443/tcp comment "HTTPS"
    ufw allow 25/tcp comment "SMTP"
    ufw allow 587/tcp comment "SMTP Submission"
    ufw allow 465/tcp comment "SMTPS"
    ufw allow 143/tcp comment "IMAP"
    ufw allow 993/tcp comment "IMAPS"
    ufw allow 5432/tcp comment "PostgreSQL (remote webmail)"

    ufw --force enable
    log_success "Firewall configured (ports: 22, 25, 80, 143, 443, 465, 587, 993, 5432)"
}

# ─── Fail2Ban ────────────────────────────────────────────────
setup_fail2ban() {
    log_step "Configuring Fail2Ban"

    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = ssh
filter  = sshd

[postfix]
enabled  = true
port     = smtp,465,submission
filter   = postfix
logpath  = /var/log/mail.log

[dovecot]
enabled = true
port    = imap,imaps
filter  = dovecot
logpath = /var/log/mail.log

[postgresql]
enabled  = true
port     = 5432
filter   = postgresql
logpath  = /var/log/postgresql/postgresql-*-main.log
maxretry = 3
EOF

    cat > /etc/fail2ban/filter.d/postgresql.conf << 'EOF'
[Definition]
failregex = FATAL:  password authentication failed for user .* client <HOST>
            FATAL:  no pg_hba.conf entry for host "<HOST>"
ignoreregex =
EOF

    systemctl enable fail2ban
    systemctl restart fail2ban
    log_success "Fail2Ban configured (SSH, Postfix, Dovecot, PostgreSQL)"
}

# ─── PostgreSQL ──────────────────────────────────────────────
install_postgresql() {
    log_step "Installing PostgreSQL"

    apt-get install -y -qq postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql

    sudo -u postgres psql -c "CREATE USER scalara WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
    sudo -u postgres psql -c "ALTER USER scalara WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE scalara OWNER scalara;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE scalara TO scalara;" 2>/dev/null || true

    log_success "PostgreSQL installed – DB: scalara, User: scalara"
}

# ─── PostgreSQL Remote Access ────────────────────────────────
configure_postgresql_remote() {
    log_step "Configuring PostgreSQL for remote access"

    local pg_version
    pg_version=$(ls /etc/postgresql/ | sort -V | tail -1)
    local pg_conf_dir="/etc/postgresql/${pg_version}/main"

    log_info "PostgreSQL version: ${pg_version}"

    # Listen on all interfaces
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "${pg_conf_dir}/postgresql.conf"
    sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/" "${pg_conf_dir}/postgresql.conf"

    # Enable SSL
    sed -i "s/#ssl = on/ssl = on/" "${pg_conf_dir}/postgresql.conf"
    sed -i "s/ssl = off/ssl = on/" "${pg_conf_dir}/postgresql.conf"

    # Remote access rules
    if ! grep -q "scalara_remote" "${pg_conf_dir}/pg_hba.conf" 2>/dev/null; then
        cat >> "${pg_conf_dir}/pg_hba.conf" << EOF

# Scalara remote webmail access (scalara_remote)
hostssl scalara scalara 0.0.0.0/0 scram-sha-256
hostssl scalara scalara ::/0      scram-sha-256
EOF
    fi

    systemctl restart postgresql
    log_success "PostgreSQL configured for remote SSL connections"
}

# ─── Create Database Schema ─────────────────────────────────
create_database_schema() {
    log_step "Creating database schema"

    PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U scalara -d scalara << 'SQLEOF'
-- Scalara Database Schema (matches Prisma schema)

DO $$ BEGIN
    CREATE TYPE "FolderType" AS ENUM ('INBOX','SENT','DRAFTS','TRASH','SPAM','STARRED','ARCHIVE','CUSTOM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    signature TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    language TEXT NOT NULL DEFAULT 'en',
    imap_host TEXT NOT NULL,
    imap_port INT NOT NULL DEFAULT 993,
    smtp_host TEXT NOT NULL,
    smtp_port INT NOT NULL DEFAULT 587,
    mail_password TEXT NOT NULL,
    emails_per_page INT NOT NULL DEFAULT 50,
    theme TEXT NOT NULL DEFAULT 'dark',
    notifications BOOLEAN NOT NULL DEFAULT true,
    auto_refresh INT NOT NULL DEFAULT 30,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_token TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMP(3) NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    type "FolderType" NOT NULL DEFAULT 'CUSTOM',
    sort_order INT NOT NULL DEFAULT 0,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS cached_emails (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    message_id TEXT NOT NULL,
    uid INT,
    from_address TEXT NOT NULL,
    from_name TEXT,
    to_addresses TEXT NOT NULL,
    cc_addresses TEXT,
    bcc_addresses TEXT,
    reply_to TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    snippet VARCHAR(300),
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_starred BOOLEAN NOT NULL DEFAULT false,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    has_attachments BOOLEAN NOT NULL DEFAULT false,
    priority INT NOT NULL DEFAULT 3,
    size INT,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    sent_at TIMESTAMP(3),
    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ce_folder ON cached_emails(folder_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_msgid ON cached_emails(message_id);
CREATE INDEX IF NOT EXISTS idx_ce_read ON cached_emails(is_read);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INT NOT NULL,
    content_id TEXT,
    path TEXT,
    email_id TEXT NOT NULL REFERENCES cached_emails(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#ffffff',
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS email_labels (
    email_id TEXT NOT NULL REFERENCES cached_emails(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY(email_id, label_id)
);

CREATE TABLE IF NOT EXISTS email_filters (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    conditions TEXT NOT NULL,
    action TEXT NOT NULL,
    action_value TEXT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT NOT NULL,
    company TEXT,
    job_title TEXT,
    website TEXT,
    address TEXT,
    notes TEXT,
    avatar TEXT,
    birthday TIMESTAMP(3),
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id, display_name);

CREATE TABLE IF NOT EXISTS contact_emails (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'personal',
    is_primary BOOLEAN NOT NULL DEFAULT false,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_phones (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    phone TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'mobile',
    is_primary BOOLEAN NOT NULL DEFAULT false,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_groups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#ffffff',
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS contact_group_members (
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
    PRIMARY KEY(contact_id, group_id)
);

CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TIMESTAMP(3) NOT NULL,
    end_time TIMESTAMP(3) NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT false,
    color TEXT,
    recurrence TEXT,
    reminders TEXT,
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cal_events ON calendar_events(user_id, start_time, end_time);

CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    finished_at TIMESTAMP(3),
    migration_name TEXT NOT NULL,
    logs TEXT,
    rolled_back_at TIMESTAMP(3),
    started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_steps_count INT NOT NULL DEFAULT 0
);

SQLEOF

    log_success "Database schema created"
}

# ─── Password / encryption helpers (Python3) ─────────────────
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
import os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
plaintext = b'${plaintext}'
key = bytes.fromhex('${key_hex}')
iv = os.urandom(16)
aesgcm = AESGCM(key)
ct = aesgcm.encrypt(iv, plaintext, None)
ciphertext = ct[:-16]
auth_tag = ct[-16:]
print(iv.hex() + ':' + auth_tag.hex() + ':' + ciphertext.hex())
"
}

# ─── Create Admin User ──────────────────────────────────────
create_admin_user() {
    log_step "Creating admin user"

    local admin_email="admin@${MAIL_DOMAIN}"

    log_info "Hashing admin password (PBKDF2)..."
    local password_hash
    password_hash=$(hash_password_pbkdf2 "${ADMIN_PASSWORD}")

    log_info "Encrypting mail password (AES-256-GCM)..."
    local encrypted_password
    encrypted_password=$(encrypt_aes256gcm "${ADMIN_PASSWORD}" "${ENCRYPTION_KEY}")

    log_info "Creating admin user in database..."
    PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U scalara -d scalara -c "
        INSERT INTO users (id, email, name, password_hash, imap_host, imap_port, smtp_host, smtp_port, mail_password)
        VALUES (
            '$(openssl rand -hex 12)',
            '${admin_email}',
            'Administrator',
            '${password_hash}',
            '${MAIL_HOSTNAME}',
            993,
            '${MAIL_HOSTNAME}',
            587,
            '${encrypted_password}'
        )
        ON CONFLICT (email) DO NOTHING;
    " 2>/dev/null

    # Create admin maildir
    local admin_maildir="/var/mail/vhosts/${MAIL_DOMAIN}/admin"
    mkdir -p "${admin_maildir}"/{cur,new,tmp}
    mkdir -p "${admin_maildir}"/.Sent/{cur,new,tmp}
    mkdir -p "${admin_maildir}"/.Drafts/{cur,new,tmp}
    mkdir -p "${admin_maildir}"/.Trash/{cur,new,tmp}
    mkdir -p "${admin_maildir}"/.Junk/{cur,new,tmp}
    mkdir -p "${admin_maildir}"/.Archive/{cur,new,tmp}
    chown -R vmail:vmail "${admin_maildir}"

    # Add to Dovecot users file
    local admin_dovecot_pass
    admin_dovecot_pass=$(doveadm pw -s SHA512-CRYPT -p "${ADMIN_PASSWORD}" 2>/dev/null || echo "")
    if [[ -n "${admin_dovecot_pass}" ]]; then
        sed -i "/^admin@${MAIL_DOMAIN}:/d" /etc/dovecot/users 2>/dev/null || true
        echo "admin@${MAIL_DOMAIN}:${admin_dovecot_pass}:5000:5000::${admin_maildir}::" >> /etc/dovecot/users
    fi

    # Add to virtual mailbox maps
    if ! grep -q "^admin@${MAIL_DOMAIN}" /etc/postfix/virtual_mailbox_maps 2>/dev/null; then
        echo "admin@${MAIL_DOMAIN}    ${MAIL_DOMAIN}/admin/" >> /etc/postfix/virtual_mailbox_maps
        postmap /etc/postfix/virtual_mailbox_maps 2>/dev/null || true
    fi

    postfix reload 2>/dev/null || true
    systemctl reload dovecot 2>/dev/null || true

    log_success "Admin user created: ${admin_email}"
}

# ─── Initial Self-Signed SSL ─────────────────────────────────
setup_initial_ssl() {
    log_step "Generating initial SSL certificate"

    local cert_dir="/etc/letsencrypt/live/${MAIL_HOSTNAME}"
    mkdir -p "${cert_dir}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${cert_dir}/privkey.pem" \
        -out "${cert_dir}/fullchain.pem" \
        -subj "/CN=${MAIL_HOSTNAME}" \
        2>/dev/null
    log_success "Self-signed cert generated at ${cert_dir}"
}

# ─── Postfix ─────────────────────────────────────────────────
install_postfix() {
    log_step "Installing Postfix"

    debconf-set-selections <<< "postfix postfix/mailname string ${MAIL_HOSTNAME}"
    debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"

    apt-get install -y -qq postfix postfix-policyd-spf-python

    local template="${INSTALLER_DIR}/templates/postfix-main.cf"
    if [[ -f "${template}" ]]; then
        cp /etc/postfix/main.cf /etc/postfix/main.cf.bak
        envsubst '${MAIL_HOSTNAME} ${MAIL_DOMAIN}' < "${template}" > /etc/postfix/main.cf
    else
        configure_postfix_inline
    fi

    # Virtual mailbox
    mkdir -p /var/mail/vhosts/${MAIL_DOMAIN}
    groupadd -g 5000 vmail 2>/dev/null || true
    useradd -g vmail -u 5000 vmail -d /var/mail/vhosts -s /usr/sbin/nologin 2>/dev/null || true
    chown -R vmail:vmail /var/mail/vhosts

    cat > /etc/postfix/virtual_mailbox_domains << EOF
${MAIL_DOMAIN}
EOF

    touch /etc/postfix/virtual_mailbox_maps
    postmap /etc/postfix/virtual_mailbox_maps 2>/dev/null || true
    postmap /etc/postfix/virtual_mailbox_domains 2>/dev/null || true
    postconf -e "virtual_mailbox_maps = hash:/etc/postfix/virtual_mailbox_maps" 2>/dev/null || true

    systemctl enable postfix
    systemctl restart postfix 2>/dev/null || log_warn "Postfix will restart after SSL certs"
    log_success "Postfix installed and configured"
}

# ─── Configure Postfix master.cf submission ──────────────────
configure_postfix_submission() {
    log_info "Enabling submission port 587 in master.cf..."

    if ! grep -q "^submission " /etc/postfix/master.cf 2>/dev/null; then
        cat >> /etc/postfix/master.cf << 'EOF'

# Scalara — Submission port 587 (STARTTLS + SASL auth)
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=yes
  -o smtpd_reject_unlisted_recipient=no
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
EOF
        log_success "Submission port 587 enabled in master.cf"
    else
        log_info "Submission already configured in master.cf"
    fi

    postfix reload 2>/dev/null || true
}

configure_postfix_inline() {
    cat > /etc/postfix/main.cf << EOF
# Scalara Postfix — Generated $(date)
smtpd_banner = \$myhostname ESMTP
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6

smtpd_tls_cert_file = /etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/${MAIL_HOSTNAME}/privkey.pem
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_ciphers = high
smtp_tls_security_level = may
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

myhostname = ${MAIL_HOSTNAME}
mydomain = ${MAIL_DOMAIN}
myorigin = \$mydomain
mydestination = localhost
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
inet_interfaces = all
inet_protocols = all

home_mailbox = Maildir/
virtual_transport = lmtp:unix:private/dovecot-lmtp
virtual_mailbox_domains = /etc/postfix/virtual_mailbox_domains

smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous, noplaintext
smtpd_sasl_tls_security_options = noanonymous

smtpd_helo_required = yes
smtpd_helo_restrictions = permit_mynetworks, reject_non_fqdn_helo_hostname, reject_invalid_helo_hostname
smtpd_sender_restrictions = permit_mynetworks, reject_non_fqdn_sender, reject_unknown_sender_domain
smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination, check_policy_service unix:private/policyd-spf

message_size_limit = 26214400
mailbox_size_limit = 0
policyd-spf_time_limit = 3600
EOF
}

# ─── Dovecot ─────────────────────────────────────────────────
install_dovecot() {
    log_step "Installing Dovecot"

    apt-get install -y -qq dovecot-core dovecot-imapd dovecot-lmtpd dovecot-pop3d

    cp /etc/dovecot/dovecot.conf /etc/dovecot/dovecot.conf.bak 2>/dev/null || true

    local template="${INSTALLER_DIR}/templates/dovecot.conf"
    if [[ -f "${template}" ]]; then
        envsubst '${MAIL_HOSTNAME} ${MAIL_DOMAIN}' < "${template}" > /etc/dovecot/dovecot.conf
    else
        configure_dovecot_inline
    fi

    cat > /etc/dovecot/conf.d/10-auth.conf << 'EOF'
disable_plaintext_auth = yes
auth_mechanisms = plain login
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT /etc/dovecot/users
}
userdb {
  driver = static
  args = uid=5000 gid=5000 home=/var/mail/vhosts/%d/%n
}
EOF

    touch /etc/dovecot/users
    chown root:dovecot /etc/dovecot/users
    chmod 640 /etc/dovecot/users

    cat > /etc/dovecot/conf.d/10-mail.conf << 'EOF'
mail_location = maildir:/var/mail/vhosts/%d/%n
namespace inbox {
  inbox = yes
  separator = /
  mailbox Drafts {
    auto = subscribe
    special_use = \Drafts
  }
  mailbox Sent {
    auto = subscribe
    special_use = \Sent
  }
  mailbox Trash {
    auto = subscribe
    special_use = \Trash
  }
  mailbox Spam {
    auto = subscribe
    special_use = \Junk
  }
  mailbox Archive {
    auto = subscribe
    special_use = \Archive
  }
}
mail_uid = 5000
mail_gid = 5000
mail_privileged_group = vmail
EOF

    cat > /etc/dovecot/conf.d/10-ssl.conf << EOF
ssl = yes
ssl_cert = </etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem
ssl_key = </etc/letsencrypt/live/${MAIL_HOSTNAME}/privkey.pem
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
EOF

    cat > /etc/dovecot/conf.d/20-lmtp.conf << 'EOF'
protocol lmtp {
  mail_plugins = $mail_plugins
  postmaster_address = postmaster@%d
}
EOF

    cat > /etc/dovecot/conf.d/10-master.conf << 'EOF'
service imap-login {
  inet_listener imap { port = 143 }
  inet_listener imaps { port = 993; ssl = yes }
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600; user = postfix; group = postfix
  }
}
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666; user = postfix; group = postfix
  }
  unix_listener auth-userdb { mode = 0600; user = vmail }
}
service auth-worker { user = vmail }
EOF

    chown -R vmail:dovecot /etc/dovecot
    chmod -R o-rwx /etc/dovecot

    systemctl enable dovecot
    systemctl restart dovecot 2>/dev/null || log_warn "Dovecot will restart after SSL certs"
    log_success "Dovecot installed and configured"
}

configure_dovecot_inline() {
    cat > /etc/dovecot/dovecot.conf << 'EOF'
protocols = imap lmtp
listen = *, ::
login_greeting = Scalara Mail
!include conf.d/*.conf
!include_try local.conf
EOF
}

# ─── SSL Certificates ───────────────────────────────────────
setup_ssl_certs() {
    log_step "Setting up Let's Encrypt SSL"

    systemctl stop nginx 2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
    fuser -k 80/tcp 2>/dev/null || true
    sleep 2

    rm -rf /etc/letsencrypt/live/${MAIL_HOSTNAME}* 2>/dev/null || true
    rm -rf /etc/letsencrypt/archive/${MAIL_HOSTNAME}* 2>/dev/null || true
    rm -f /etc/letsencrypt/renewal/${MAIL_HOSTNAME}*.conf 2>/dev/null || true

    log_info "Obtaining SSL certificate for ${MAIL_HOSTNAME}..."
    if certbot certonly --standalone \
        --non-interactive --agree-tos \
        --email "${ADMIN_EMAIL}" \
        -d "${MAIL_HOSTNAME}" \
        --force-renewal 2>&1; then
        log_success "SSL cert obtained for ${MAIL_HOSTNAME}"
    else
        log_warn "SSL cert failed — run manually: certbot certonly --standalone -d ${MAIL_HOSTNAME}"
        return 0
    fi

    systemctl enable certbot.timer 2>/dev/null || true

    local MAIL_CERT_DIR=""
    for suffix in "" "-0001" "-0002" "-0003"; do
        if [[ -f "/etc/letsencrypt/live/${MAIL_HOSTNAME}${suffix}/fullchain.pem" ]]; then
            MAIL_CERT_DIR="/etc/letsencrypt/live/${MAIL_HOSTNAME}${suffix}"
            break
        fi
    done

    if [[ -n "${MAIL_CERT_DIR}" ]]; then
        log_info "Applying Let's Encrypt certs..."
        cat > /etc/dovecot/conf.d/10-ssl.conf << EOF
ssl = required
ssl_cert = <${MAIL_CERT_DIR}/fullchain.pem
ssl_key = <${MAIL_CERT_DIR}/privkey.pem
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
EOF
        postconf -e "smtpd_tls_cert_file = ${MAIL_CERT_DIR}/fullchain.pem"
        postconf -e "smtpd_tls_key_file = ${MAIL_CERT_DIR}/privkey.pem"
    fi

    systemctl restart postfix 2>/dev/null || true
    systemctl restart dovecot 2>/dev/null || true
    log_success "SSL certificates configured"
}

# ─── DKIM Setup ──────────────────────────────────────────────
setup_dkim() {
    log_step "Setting up DKIM"

    apt-get install -y -qq opendkim opendkim-tools
    mkdir -p /etc/opendkim/keys/${MAIL_DOMAIN}

    opendkim-genkey -b 2048 -d "${MAIL_DOMAIN}" -D "/etc/opendkim/keys/${MAIL_DOMAIN}" -s scalara -v
    chown -R opendkim:opendkim /etc/opendkim
    chmod 700 /etc/opendkim/keys

    cat > /etc/opendkim.conf << EOF
AutoRestart Yes
AutoRestartRate 10/1h
Syslog yes
SyslogSuccess Yes
LogWhy Yes
Canonicalization relaxed/simple
ExternalIgnoreList refile:/etc/opendkim/TrustedHosts
InternalHosts refile:/etc/opendkim/TrustedHosts
KeyTable refile:/etc/opendkim/KeyTable
SigningTable refile:/etc/opendkim/SigningTable
Mode sv
PidFile /run/opendkim/opendkim.pid
SignatureAlgorithm rsa-sha256
UserID opendkim:opendkim
Socket inet:12301@localhost
EOF

    cat > /etc/opendkim/TrustedHosts << EOF
127.0.0.1
localhost
${MAIL_HOSTNAME}
*.${MAIL_DOMAIN}
EOF

    echo "scalara._domainkey.${MAIL_DOMAIN} ${MAIL_DOMAIN}:scalara:/etc/opendkim/keys/${MAIL_DOMAIN}/scalara.private" > /etc/opendkim/KeyTable
    echo "*@${MAIL_DOMAIN} scalara._domainkey.${MAIL_DOMAIN}" > /etc/opendkim/SigningTable

    postconf -e "milter_protocol = 6"
    postconf -e "milter_default_action = accept"
    postconf -e "smtpd_milters = inet:localhost:12301"
    postconf -e "non_smtpd_milters = inet:localhost:12301"

    systemctl enable opendkim
    systemctl restart opendkim
    systemctl restart postfix
    log_success "DKIM configured"
}

# ─── Install Admin Script ───────────────────────────────────
install_admin_script() {
    log_step "Installing admin script"

    if [[ -f "${INSTALLER_DIR}/admin.sh" ]]; then
        cp "${INSTALLER_DIR}/admin.sh" "${SCALARA_HOME}/admin.sh"
        chmod +x "${SCALARA_HOME}/admin.sh"
        ln -sf "${SCALARA_HOME}/admin.sh" /usr/local/bin/scalara-admin 2>/dev/null || true
        log_success "Admin script installed (run: sudo scalara-admin)"
    fi
}

# ─── Save Config ─────────────────────────────────────────────
save_config() {
    log_step "Saving configuration"

    local server_ip
    server_ip=$(get_public_ip)

    cat > "${CONFIG_DIR}/engine.env" << EOF
# Scalara Engine Config — Generated $(date)
MAIL_DOMAIN=${MAIL_DOMAIN}
MAIL_HOSTNAME=${MAIL_HOSTNAME}
SERVER_IP=${server_ip}
DB_NAME=scalara
DB_USER=scalara
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://scalara:${DB_PASSWORD}@${server_ip}:5432/scalara?sslmode=require
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
WEBMAIL_URL=${WEBMAIL_URL}
EOF
    chmod 600 "${CONFIG_DIR}/engine.env"

    cat > "${CONFIG_DIR}/webmail.env" << EOF
# ═══════════════════════════════════════════════════
# Scalara Webmail — Environment Variables
# Copy these to your Vercel project settings
# or to the .env file on your Node.js host
# Generated: $(date)
# ═══════════════════════════════════════════════════

# Database (connects to VPS PostgreSQL remotely)
DATABASE_URL="postgresql://scalara:${DB_PASSWORD}@${server_ip}:5432/scalara?sslmode=require"

# Authentication
NEXTAUTH_URL="${WEBMAIL_URL}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"

# Mail Server (connects to VPS IMAP/SMTP remotely)
IMAP_HOST="${MAIL_HOSTNAME}"
IMAP_PORT=993
SMTP_HOST="${MAIL_HOSTNAME}"
SMTP_PORT=587

# Encryption key (MUST match the engine)
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

# App
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
    chmod 600 "${CONFIG_DIR}/webmail.env"

    cat > "${CONFIG_DIR}/dns-records.txt" << EOF
# Scalara DNS Records — Server IP: ${server_ip}
${MAIL_HOSTNAME}         A       ${server_ip}
${MAIL_DOMAIN}           MX 10   ${MAIL_HOSTNAME}
${MAIL_DOMAIN}           TXT     "v=spf1 mx a:${MAIL_HOSTNAME} ~all"
_dmarc.${MAIL_DOMAIN}    TXT     "v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}"
${server_ip}             PTR     ${MAIL_HOSTNAME}
EOF

    log_success "Configuration saved to ${CONFIG_DIR}/"
}

# ─── Print DNS Instructions ─────────────────────────────────
print_dns_instructions() {
    log_step "Required DNS Records"

    local server_ip
    server_ip=$(get_public_ip)

    echo -e "${WHITE}${BOLD}Add these DNS records in Cloudflare / your registrar:${NC}\n"

    echo -e "  ${CYAN}Type${NC}   ${CYAN}Host${NC}                              ${CYAN}Value${NC}"
    echo -e "  ───── ──────────────────────────────────── ────────────────────────────────────"
    echo -e "  ${GREEN}A${NC}      ${MAIL_HOSTNAME}               ${server_ip}"
    echo -e "  ${GREEN}MX${NC}     ${MAIL_DOMAIN}                      ${MAIL_HOSTNAME} (Priority: 10)"
    echo -e "  ${GREEN}TXT${NC}    ${MAIL_DOMAIN}                      \"v=spf1 mx a:${MAIL_HOSTNAME} ~all\""
    echo -e "  ${GREEN}TXT${NC}    _dmarc.${MAIL_DOMAIN}               \"v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}\""

    if [[ -f "/etc/opendkim/keys/${MAIL_DOMAIN}/scalara.txt" ]]; then
        echo ""
        echo -e "  ${GREEN}TXT${NC}    scalara._domainkey.${MAIL_DOMAIN}"
        echo -e "         $(cat /etc/opendkim/keys/${MAIL_DOMAIN}/scalara.txt 2>/dev/null | tr -d '\n' | sed 's/\s\+/ /g')"
    fi

    echo ""
    echo -e "  ${GREEN}PTR${NC}    ${server_ip}                        ${MAIL_HOSTNAME}"
    echo -e "         ${YELLOW}(Set via VPS provider control panel)${NC}"
    echo ""
}

# ─── Print completion ────────────────────────────────────────
print_completion() {
    local server_ip
    server_ip=$(get_public_ip)

    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║    ✅  Scalara Engine Installation Complete!          ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${WHITE}${BOLD}VPS Services:${NC}"
    echo -e "  Postfix (SMTP):   Ports 25, 587, 465"
    echo -e "  Dovecot (IMAP):   Ports 143, 993"
    echo -e "  OpenDKIM:         Active"
    echo -e "  PostgreSQL:       Port 5432 (remote access enabled)"
    echo -e "  Fail2Ban:         Active"
    echo ""
    echo -e "${WHITE}${BOLD}Admin Account:${NC}"
    echo -e "  Email:    ${GREEN}admin@${MAIL_DOMAIN}${NC}"
    echo -e "  Password: ${GREEN}(set during installation)${NC}"
    echo ""
    echo -e "${WHITE}${BOLD}━━━ NEXT: Deploy Webmail to Vercel ━━━${NC}"
    echo ""
    echo -e "  ${CYAN}1.${NC} Push the ${WHITE}webmail/${NC} folder to a GitHub repo"
    echo -e "  ${CYAN}2.${NC} Go to ${WHITE}vercel.com${NC} → Import Project → select your repo"
    echo -e "  ${CYAN}3.${NC} Set Root Directory = ${WHITE}webmail${NC}"
    echo -e "  ${CYAN}4.${NC} Add the env vars from: ${GREEN}cat ${CONFIG_DIR}/webmail.env${NC}"
    echo -e "  ${CYAN}5.${NC} Deploy, then add your custom domain in Vercel settings"
    echo -e "  ${CYAN}6.${NC} Add DNS records (shown above) in Cloudflare"
    echo ""
    echo -e "${WHITE}${BOLD}Management:${NC}  ${CYAN}sudo scalara-admin${NC}"
    echo -e "${WHITE}${BOLD}Webmail env:${NC} ${CYAN}cat ${CONFIG_DIR}/webmail.env${NC}"
    echo -e "${WHITE}${BOLD}DNS records:${NC} ${CYAN}cat ${CONFIG_DIR}/dns-records.txt${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════
main() {
    print_banner
    preflight_checks
    collect_config

    setup_system
    setup_firewall
    setup_fail2ban
    install_postgresql
    configure_postgresql_remote
    create_database_schema
    setup_initial_ssl
    install_postfix
    configure_postfix_submission
    install_dovecot
    setup_ssl_certs
    setup_dkim
    create_admin_user
    install_admin_script
    save_config

    print_dns_instructions
    print_completion
}

main "$@"
