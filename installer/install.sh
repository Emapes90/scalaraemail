#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Mail Server & Webmail Auto-Installer
#  Production-grade installer for Ubuntu 22.04/24.04
#
#  Installs: PostgreSQL, Postfix, Dovecot, Nginx, Node.js,
#            Let's Encrypt SSL, Scalara Webmail
#
#  Usage: sudo bash install.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail
IFS=$'\n\t'

# ─── Constants ───────────────────────────────────────────────
readonly INSTALLER_VERSION="1.0.0"
readonly INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/scalara-install.log"
readonly SCALARA_HOME="/opt/scalara"
readonly SCALARA_USER="scalara"
readonly WEBMAIL_DIR="${SCALARA_HOME}/webmail"
readonly CONFIG_DIR="${SCALARA_HOME}/config"
readonly MIN_RAM_MB=1024
readonly MIN_DISK_GB=10
readonly NODE_VERSION="20"

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
    echo "║          Mail Server & Webmail Installer              ║"
    echo "║                  Version ${INSTALLER_VERSION}                       ║"
    echo "║                                                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ─── Pre-flight checks ──────────────────────────────────────
preflight_checks() {
    log_step "Running pre-flight checks"

    # Root check
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi

    # OS check
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

    # RAM check
    local total_ram
    total_ram=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    if [[ ${total_ram} -lt ${MIN_RAM_MB} ]]; then
        log_error "Minimum ${MIN_RAM_MB}MB RAM required. Found: ${total_ram}MB"
        exit 1
    fi
    log_success "RAM: ${total_ram}MB"

    # Disk check
    local free_disk
    free_disk=$(df -BG / | awk 'NR==2 {print int($4)}')
    if [[ ${free_disk} -lt ${MIN_DISK_GB} ]]; then
        log_error "Minimum ${MIN_DISK_GB}GB free disk required. Found: ${free_disk}GB"
        exit 1
    fi
    log_success "Free disk: ${free_disk}GB"

    # Ports check
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

    # Webmail hostname
    WEBMAIL_HOSTNAME="webmail.${MAIL_DOMAIN}"
    read -rp "$(echo -e "${CYAN}Webmail hostname [${WEBMAIL_HOSTNAME}]:${NC} ")" input
    WEBMAIL_HOSTNAME="${input:-${WEBMAIL_HOSTNAME}}"

    # Admin email
    read -rp "$(echo -e "${CYAN}Admin email for SSL certs:${NC} ")" ADMIN_EMAIL
    if [[ -z "${ADMIN_EMAIL}" ]]; then
        ADMIN_EMAIL="admin@${MAIL_DOMAIN}"
        log_warn "Using default: ${ADMIN_EMAIL}"
    fi

    # Admin password for webmail
    while true; do
        read -srp "$(echo -e "${CYAN}Admin password (min 8 chars):${NC} ")" ADMIN_PASSWORD
        echo
        if [[ ${#ADMIN_PASSWORD} -ge 8 ]]; then
            break
        fi
        log_warn "Password must be at least 8 characters"
    done

    # Database password
    DB_PASSWORD=$(generate_password 32)

    # NextAuth secret
    NEXTAUTH_SECRET=$(generate_password 48)

    # Encryption key for mail passwords
    ENCRYPTION_KEY=$(openssl rand -hex 32)

    echo ""
    echo -e "${WHITE}${BOLD}Configuration Summary:${NC}"
    echo -e "  Mail Domain:     ${GREEN}${MAIL_DOMAIN}${NC}"
    echo -e "  Mail Hostname:   ${GREEN}${MAIL_HOSTNAME}${NC}"
    echo -e "  Webmail URL:     ${GREEN}https://${WEBMAIL_HOSTNAME}${NC}"
    echo -e "  Admin Email:     ${GREEN}${ADMIN_EMAIL}${NC}"
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

    # Update packages
    log_info "Updating system packages..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get upgrade -y -qq
    log_success "System updated"

    # Install essentials
    log_info "Installing essential packages..."
    apt-get install -y -qq \
        curl wget gnupg2 ca-certificates lsb-release \
        software-properties-common apt-transport-https \
        ufw fail2ban git unzip jq openssl dnsutils \
        build-essential python3-certbot-nginx
    log_success "Essential packages installed"

    # Set hostname
    log_info "Setting hostname to ${MAIL_HOSTNAME}..."
    hostnamectl set-hostname "${MAIL_HOSTNAME}"
    echo "${MAIL_HOSTNAME}" > /etc/hostname
    log_success "Hostname set"

    # Create scalara user
    if ! id "${SCALARA_USER}" &>/dev/null; then
        useradd -r -m -d "${SCALARA_HOME}" -s /bin/bash "${SCALARA_USER}"
        log_success "User ${SCALARA_USER} created"
    fi

    # Create directories
    mkdir -p "${SCALARA_HOME}" "${CONFIG_DIR}" "${WEBMAIL_DIR}"
    chown -R "${SCALARA_USER}:${SCALARA_USER}" "${SCALARA_HOME}"
    log_success "Directories created"
}

# ─── Firewall ────────────────────────────────────────────────
setup_firewall() {
    log_step "Configuring firewall"

    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing

    # SSH
    ufw allow 22/tcp comment "SSH"
    # HTTP / HTTPS
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    # SMTP
    ufw allow 25/tcp comment "SMTP"
    ufw allow 587/tcp comment "SMTP Submission"
    ufw allow 465/tcp comment "SMTPS"
    # IMAP
    ufw allow 143/tcp comment "IMAP"
    ufw allow 993/tcp comment "IMAPS"

    ufw --force enable
    log_success "Firewall configured and enabled"
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
EOF

    systemctl enable fail2ban
    systemctl restart fail2ban
    log_success "Fail2Ban configured"
}

# ─── PostgreSQL ──────────────────────────────────────────────
install_postgresql() {
    log_step "Installing PostgreSQL"

    apt-get install -y -qq postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql

    # Create database and user (ALTER ensures password is correct on re-runs)
    sudo -u postgres psql -c "CREATE USER scalara WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
    sudo -u postgres psql -c "ALTER USER scalara WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE scalara OWNER scalara;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE scalara TO scalara;" 2>/dev/null || true

    log_success "PostgreSQL installed – DB: scalara, User: scalara"
}

# ─── Initial Self-Signed SSL ─────────────────────────────────
setup_initial_ssl() {
    log_step "Generating initial SSL certificates"

    # Use /etc/ssl/scalara/ for self-signed so certbot can use /etc/letsencrypt/ later
    for domain in "${MAIL_HOSTNAME}" "${WEBMAIL_HOSTNAME}"; do
        local cert_dir="/etc/ssl/scalara/${domain}"
        mkdir -p "${cert_dir}"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${cert_dir}/privkey.pem" \
            -out "${cert_dir}/fullchain.pem" \
            -subj "/CN=${domain}" \
            2>/dev/null
        log_success "Self-signed cert generated for ${domain}"
    done

    log_success "Initial SSL certificates ready"
}

# ─── Postfix ─────────────────────────────────────────────────
install_postfix() {
    log_step "Installing Postfix"

    debconf-set-selections <<< "postfix postfix/mailname string ${MAIL_HOSTNAME}"
    debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"

    apt-get install -y -qq postfix postfix-policyd-spf-python

    # Apply template
    local template="${INSTALLER_DIR}/templates/postfix-main.cf"
    if [[ -f "${template}" ]]; then
        cp /etc/postfix/main.cf /etc/postfix/main.cf.bak
        envsubst '${MAIL_HOSTNAME} ${MAIL_DOMAIN}' < "${template}" > /etc/postfix/main.cf
    else
        configure_postfix_inline
    fi

    # Virtual mailbox setup
    mkdir -p /var/mail/vhosts/${MAIL_DOMAIN}
    groupadd -g 5000 vmail 2>/dev/null || true
    useradd -g vmail -u 5000 vmail -d /var/mail/vhosts -s /usr/sbin/nologin 2>/dev/null || true
    chown -R vmail:vmail /var/mail/vhosts

    # Create virtual mailbox maps
    cat > /etc/postfix/virtual_mailbox_domains << EOF
${MAIL_DOMAIN}
EOF

    postmap /etc/postfix/virtual_mailbox_domains 2>/dev/null || true

    systemctl enable postfix
    systemctl restart postfix 2>/dev/null || log_warn "Postfix will be restarted after SSL certs"
    log_success "Postfix installed and configured"
}

configure_postfix_inline() {
    cat > /etc/postfix/main.cf << EOF
# Scalara Postfix Configuration
# Generated on $(date)

smtpd_banner = \$myhostname ESMTP
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6

# TLS parameters
smtpd_tls_cert_file = /etc/ssl/scalara/${MAIL_HOSTNAME}/fullchain.pem
smtpd_tls_key_file = /etc/ssl/scalara/${MAIL_HOSTNAME}/privkey.pem
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_ciphers = high

smtp_tls_security_level = may
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtp_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# Network
myhostname = ${MAIL_HOSTNAME}
mydomain = ${MAIL_DOMAIN}
myorigin = \$mydomain
mydestination = localhost
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
inet_interfaces = all
inet_protocols = all

# Mailbox
home_mailbox = Maildir/
virtual_transport = lmtp:unix:private/dovecot-lmtp
virtual_mailbox_domains = /etc/postfix/virtual_mailbox_domains

# SASL Auth via Dovecot
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous, noplaintext
smtpd_sasl_tls_security_options = noanonymous

# Restrictions
smtpd_helo_required = yes
smtpd_helo_restrictions =
    permit_mynetworks,
    reject_non_fqdn_helo_hostname,
    reject_invalid_helo_hostname

smtpd_sender_restrictions =
    permit_mynetworks,
    reject_non_fqdn_sender,
    reject_unknown_sender_domain

smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination,
    reject_non_fqdn_recipient,
    reject_unknown_recipient_domain

# Message size limit (25MB)
message_size_limit = 26214400
mailbox_size_limit = 0

# SPF
policyd-spf_time_limit = 3600
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination,
    check_policy_service unix:private/policyd-spf
EOF
}

# ─── Dovecot ─────────────────────────────────────────────────
install_dovecot() {
    log_step "Installing Dovecot"

    apt-get install -y -qq dovecot-core dovecot-imapd dovecot-lmtpd dovecot-pop3d

    # Backup originals
    cp /etc/dovecot/dovecot.conf /etc/dovecot/dovecot.conf.bak 2>/dev/null || true

    local template="${INSTALLER_DIR}/templates/dovecot.conf"
    if [[ -f "${template}" ]]; then
        envsubst '${MAIL_HOSTNAME} ${MAIL_DOMAIN}' < "${template}" > /etc/dovecot/dovecot.conf
    else
        configure_dovecot_inline
    fi

    # Create auth config
    cat > /etc/dovecot/conf.d/10-auth.conf << 'EOF'
disable_plaintext_auth = yes
auth_mechanisms = plain login
!include auth-system.conf.ext
EOF

    # Create mail config
    cat > /etc/dovecot/conf.d/10-mail.conf << EOF
mail_location = maildir:/var/mail/vhosts/%d/%n
namespace inbox {
  inbox = yes
  separator = /
  mailbox Drafts {
    auto = subscribe
    special_use = \\Drafts
  }
  mailbox Sent {
    auto = subscribe
    special_use = \\Sent
  }
  mailbox Trash {
    auto = subscribe
    special_use = \\Trash
  }
  mailbox Spam {
    auto = subscribe
    special_use = \\Junk
  }
  mailbox Archive {
    auto = subscribe
    special_use = \\Archive
  }
}
mail_uid = 5000
mail_gid = 5000
mail_privileged_group = vmail
EOF

    # SSL config
    # SSL config (use self-signed initially, switch to letsencrypt after real certs)
    cat > /etc/dovecot/conf.d/10-ssl.conf << EOF
ssl = yes
ssl_cert = </etc/ssl/scalara/${MAIL_HOSTNAME}/fullchain.pem
ssl_key = </etc/ssl/scalara/${MAIL_HOSTNAME}/privkey.pem
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
EOF

    # LMTP config
    cat > /etc/dovecot/conf.d/20-lmtp.conf << 'EOF'
protocol lmtp {
  mail_plugins = $mail_plugins
  postmaster_address = postmaster@%d
}
EOF

    # Master config for Postfix integration
    cat > /etc/dovecot/conf.d/10-master.conf << 'EOF'
service imap-login {
  inet_listener imap {
    port = 143
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}

service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
  unix_listener auth-userdb {
    mode = 0600
    user = vmail
  }
}

service auth-worker {
  user = vmail
}
EOF

    chown -R vmail:dovecot /etc/dovecot
    chmod -R o-rwx /etc/dovecot

    systemctl enable dovecot
    if systemctl restart dovecot 2>/dev/null; then
        log_success "Dovecot installed and configured"
    else
        log_warn "Dovecot installed but failed to start – will retry after SSL certs"
    fi
}

configure_dovecot_inline() {
    cat > /etc/dovecot/dovecot.conf << 'EOF'
# Scalara Dovecot Configuration
protocols = imap lmtp
listen = *, ::
login_greeting = Scalara Mail

!include conf.d/*.conf
!include_try local.conf
EOF
}

# ─── Node.js ─────────────────────────────────────────────────
install_nodejs() {
    log_step "Installing Node.js ${NODE_VERSION}"

    if ! command -v node &>/dev/null || [[ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt "${NODE_VERSION}" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y -qq nodejs
    fi

    # Install PM2 globally
    npm install -g pm2@latest --silent

    log_success "Node.js $(node -v) and PM2 installed"
}

# ─── Nginx ───────────────────────────────────────────────────
install_nginx() {
    log_step "Installing Nginx"

    apt-get install -y -qq nginx

    local template="${INSTALLER_DIR}/templates/nginx.conf"
    if [[ -f "${template}" ]]; then
        envsubst '${WEBMAIL_HOSTNAME}' < "${template}" > /etc/nginx/sites-available/scalara
    else
        configure_nginx_inline
    fi

    ln -sf /etc/nginx/sites-available/scalara /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # Test config
    if nginx -t 2>/dev/null; then
        systemctl enable nginx
        systemctl restart nginx
        log_success "Nginx installed and configured"
    else
        log_warn "Nginx config test failed – will retry after SSL certs are obtained"
        systemctl enable nginx
    fi
}

configure_nginx_inline() {
    cat > /etc/nginx/sites-available/scalara << EOF
# Scalara Webmail – Nginx Config

# Rate limiting
limit_req_zone \$binary_remote_addr zone=scalara_limit:10m rate=10r/s;

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${WEBMAIL_HOSTNAME};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${WEBMAIL_HOSTNAME};

    # SSL (self-signed initially, updated to letsencrypt later)
    ssl_certificate     /etc/ssl/scalara/${WEBMAIL_HOSTNAME}/fullchain.pem;
    ssl_certificate_key /etc/ssl/scalara/${WEBMAIL_HOSTNAME}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate limiting
    limit_req zone=scalara_limit burst=20 nodelay;

    # Max body size for attachments
    client_max_body_size 25M;

    # Proxy to Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Static files caching
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Deny hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
}

# ─── Deploy Webmail ──────────────────────────────────────────
deploy_webmail() {
    log_step "Deploying Scalara Webmail"

    # Copy webmail source (including hidden files like .env.example, .gitignore)
    if [[ -d "${INSTALLER_DIR}/../webmail" ]]; then
        cp -r "${INSTALLER_DIR}/../webmail/". "${WEBMAIL_DIR}/"
        log_success "Webmail source copied"
    else
        log_error "Webmail source not found at ${INSTALLER_DIR}/../webmail"
        log_info "Please copy the webmail directory to ${WEBMAIL_DIR} manually"
        return 1
    fi

    # Create .env file
    cat > "${WEBMAIL_DIR}/.env" << EOF
# Scalara Webmail Environment – Auto-generated
# Generated on: $(date)
# ─────────────────────────────────────────────

# Database
DATABASE_URL="postgresql://scalara:${DB_PASSWORD}@localhost:5432/scalara?schema=public"

# Authentication
NEXTAUTH_URL="https://${WEBMAIL_HOSTNAME}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"

# Mail Server
MAIL_HOST="${MAIL_HOSTNAME}"
IMAP_HOST="${MAIL_HOSTNAME}"
IMAP_PORT=993
SMTP_HOST="${MAIL_HOSTNAME}"
SMTP_PORT=587

# Encryption
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

# App
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF

    chown -R "${SCALARA_USER}:${SCALARA_USER}" "${WEBMAIL_DIR}"
    chmod 600 "${WEBMAIL_DIR}/.env"

    # Install dependencies
    log_info "Installing Node.js dependencies (this may take a minute)..."
    cd "${WEBMAIL_DIR}"
    # Run npm install as scalara user with legacy-peer-deps for compatibility
    if sudo -u "${SCALARA_USER}" npm install --legacy-peer-deps 2>&1 | tail -20; then
        log_success "Dependencies installed"
    else
        log_error "npm install failed. Trying with root..."
        npm install --legacy-peer-deps 2>&1 | tail -20
        chown -R "${SCALARA_USER}:${SCALARA_USER}" "${WEBMAIL_DIR}"
        log_success "Dependencies installed (as root)"
    fi

    # Generate Prisma client & run migrations
    log_info "Setting up database schema..."
    cd "${WEBMAIL_DIR}"
    sudo -u "${SCALARA_USER}" npx prisma generate 2>&1 | tail -5
    sudo -u "${SCALARA_USER}" npx prisma db push --accept-data-loss 2>&1 | tail -10
    log_success "Database schema applied"

    # Create admin user
    log_info "Creating admin user..."
    create_admin_user
    log_success "Admin user created"

    # Build Next.js app
    log_info "Building webmail (this may take 2-5 minutes)..."
    cd "${WEBMAIL_DIR}"
    if sudo -u "${SCALARA_USER}" npm run build 2>&1 | tail -30; then
        log_success "Webmail built successfully"
    else
        log_error "Build failed. Trying with root..."
        npm run build 2>&1 | tail -30
        chown -R "${SCALARA_USER}:${SCALARA_USER}" "${WEBMAIL_DIR}"
        log_success "Webmail built (as root)"
    fi

    # Setup PM2
    log_info "Setting up PM2 process manager..."
    cd "${WEBMAIL_DIR}"
    sudo -u "${SCALARA_USER}" pm2 delete scalara 2>/dev/null || true
    sudo -u "${SCALARA_USER}" pm2 start npm --name "scalara" -- start
    sudo -u "${SCALARA_USER}" pm2 save
    pm2 startup systemd -u "${SCALARA_USER}" --hp "${SCALARA_HOME}" 2>/dev/null || true
    log_success "PM2 configured – Scalara running on port 3000"
}

# ─── Create Admin User ──────────────────────────────────────
create_admin_user() {
    cd "${WEBMAIL_DIR}"

    # Use a Node.js script to create the admin user with proper hashing
    cat > /tmp/scalara-create-admin.js << SCRIPT
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
    return salt + ':' + hash;
}

function encrypt(text) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

async function main() {
    const email = 'admin@${MAIL_DOMAIN}';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log('Admin user already exists');
        return;
    }

    await prisma.user.create({
        data: {
            email: email,
            name: 'Administrator',
            password: hashPassword('${ADMIN_PASSWORD}'),
            imapHost: '${MAIL_HOSTNAME}',
            imapPort: 993,
            smtpHost: '${MAIL_HOSTNAME}',
            smtpPort: 587,
            mailPassword: encrypt('${ADMIN_PASSWORD}'),
        },
    });

    console.log('Admin user created: ' + email);
}

main()
    .catch(console.error)
    .finally(() => prisma.\$disconnect());
SCRIPT

    sudo -u "${SCALARA_USER}" node /tmp/scalara-create-admin.js
    rm -f /tmp/scalara-create-admin.js
}

# ─── SSL Certificates ───────────────────────────────────────
setup_ssl_certs() {
    log_step "Setting up Let's Encrypt SSL certificates"

    # Stop everything that uses port 80/443
    systemctl stop nginx 2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true

    # Kill anything still on port 80
    fuser -k 80/tcp 2>/dev/null || true
    sleep 2

    # Clean up any old/stale Let's Encrypt directories to avoid -0001 suffix issues
    log_info "Cleaning old Let's Encrypt directories..."
    for domain in "${MAIL_HOSTNAME}" "${WEBMAIL_HOSTNAME}"; do
        # Remove all variants (base, -0001, -0002, etc.)
        rm -rf /etc/letsencrypt/live/${domain}* 2>/dev/null || true
        rm -rf /etc/letsencrypt/archive/${domain}* 2>/dev/null || true
        rm -f /etc/letsencrypt/renewal/${domain}*.conf 2>/dev/null || true
    done

    # Get certificate for webmail hostname
    log_info "Obtaining SSL certificate for ${WEBMAIL_HOSTNAME}..."
    if certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "${ADMIN_EMAIL}" \
        -d "${WEBMAIL_HOSTNAME}" \
        --force-renewal 2>&1; then
        log_success "SSL cert obtained for ${WEBMAIL_HOSTNAME}"
    else
        log_warn "SSL cert for webmail failed – you can run certbot manually later"
    fi

    # Get certificate for mail hostname
    log_info "Obtaining SSL certificate for ${MAIL_HOSTNAME}..."
    if certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "${ADMIN_EMAIL}" \
        -d "${MAIL_HOSTNAME}" \
        --force-renewal 2>&1; then
        log_success "SSL cert obtained for ${MAIL_HOSTNAME}"
    else
        log_warn "SSL cert for mail failed – you can run certbot manually later"
    fi

    # Auto-renewal
    systemctl enable certbot.timer 2>/dev/null || true

    # Find the actual cert directory (handles -0001 suffix from previous runs)
    local MAIL_CERT_DIR=""
    local WEBMAIL_CERT_DIR=""

    # Check base name first, then -0001, -0002, etc.
    for suffix in "" "-0001" "-0002" "-0003"; do
        if [[ -f "/etc/letsencrypt/live/${MAIL_HOSTNAME}${suffix}/fullchain.pem" ]]; then
            MAIL_CERT_DIR="/etc/letsencrypt/live/${MAIL_HOSTNAME}${suffix}"
            break
        fi
    done
    for suffix in "" "-0001" "-0002" "-0003"; do
        if [[ -f "/etc/letsencrypt/live/${WEBMAIL_HOSTNAME}${suffix}/fullchain.pem" ]]; then
            WEBMAIL_CERT_DIR="/etc/letsencrypt/live/${WEBMAIL_HOSTNAME}${suffix}"
            break
        fi
    done

    log_info "Mail cert dir: ${MAIL_CERT_DIR:-NOT FOUND}"
    log_info "Webmail cert dir: ${WEBMAIL_CERT_DIR:-NOT FOUND}"

    # If real certs exist, update Dovecot/Postfix to use them
    if [[ -n "${MAIL_CERT_DIR}" ]]; then
        log_info "Updating mail services to use Let's Encrypt certs..."

        # Update Dovecot
        cat > /etc/dovecot/conf.d/10-ssl.conf << EOF
ssl = required
ssl_cert = <${MAIL_CERT_DIR}/fullchain.pem
ssl_key = <${MAIL_CERT_DIR}/privkey.pem
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
EOF

        # Update Postfix TLS
        postconf -e "smtpd_tls_cert_file = ${MAIL_CERT_DIR}/fullchain.pem"
        postconf -e "smtpd_tls_key_file = ${MAIL_CERT_DIR}/privkey.pem"
    fi

    # Update Nginx if webmail cert exists
    if [[ -n "${WEBMAIL_CERT_DIR}" ]]; then
        sed -i "s|/etc/ssl/scalara/${WEBMAIL_HOSTNAME}|${WEBMAIL_CERT_DIR}|g" /etc/nginx/sites-available/scalara 2>/dev/null || true
    fi

    # Restart all services with new certs
    log_info "Restarting services with SSL certificates..."
    systemctl restart postfix 2>/dev/null || true
    systemctl restart dovecot 2>/dev/null || true
    systemctl start nginx 2>/dev/null || true

    log_success "SSL certificates configured"
}

# ─── DKIM Setup ──────────────────────────────────────────────
setup_dkim() {
    log_step "Setting up DKIM"

    apt-get install -y -qq opendkim opendkim-tools

    mkdir -p /etc/opendkim/keys/${MAIL_DOMAIN}

    # Generate DKIM key
    opendkim-genkey -b 2048 -d "${MAIL_DOMAIN}" -D "/etc/opendkim/keys/${MAIL_DOMAIN}" -s scalara -v

    chown -R opendkim:opendkim /etc/opendkim
    chmod 700 /etc/opendkim/keys

    # Config
    cat > /etc/opendkim.conf << EOF
AutoRestart             Yes
AutoRestartRate         10/1h
Syslog                  yes
SyslogSuccess           Yes
LogWhy                  Yes
Canonicalization        relaxed/simple
ExternalIgnoreList      refile:/etc/opendkim/TrustedHosts
InternalHosts           refile:/etc/opendkim/TrustedHosts
KeyTable                refile:/etc/opendkim/KeyTable
SigningTable            refile:/etc/opendkim/SigningTable
Mode                    sv
PidFile                 /run/opendkim/opendkim.pid
SignatureAlgorithm      rsa-sha256
UserID                  opendkim:opendkim
Socket                  inet:12301@localhost
EOF

    cat > /etc/opendkim/TrustedHosts << EOF
127.0.0.1
localhost
${MAIL_HOSTNAME}
*.${MAIL_DOMAIN}
EOF

    cat > /etc/opendkim/KeyTable << EOF
scalara._domainkey.${MAIL_DOMAIN} ${MAIL_DOMAIN}:scalara:/etc/opendkim/keys/${MAIL_DOMAIN}/scalara.private
EOF

    cat > /etc/opendkim/SigningTable << EOF
*@${MAIL_DOMAIN} scalara._domainkey.${MAIL_DOMAIN}
EOF

    # Add milter to Postfix
    postconf -e "milter_protocol = 6"
    postconf -e "milter_default_action = accept"
    postconf -e "smtpd_milters = inet:localhost:12301"
    postconf -e "non_smtpd_milters = inet:localhost:12301"

    systemctl enable opendkim
    systemctl restart opendkim
    systemctl restart postfix

    log_success "DKIM configured"
}

# ─── Print DNS Records ──────────────────────────────────────
print_dns_instructions() {
    log_step "Required DNS Records"

    local server_ip
    server_ip=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

    echo -e "${WHITE}${BOLD}Add these DNS records to your domain registrar:${NC}\n"

    echo -e "${CYAN}━━━ A Records ━━━${NC}"
    echo -e "  ${GREEN}${MAIL_HOSTNAME}${NC}     → A    → ${server_ip}"
    echo -e "  ${GREEN}${WEBMAIL_HOSTNAME}${NC}  → A    → ${server_ip}"

    echo -e "\n${CYAN}━━━ MX Record ━━━${NC}"
    echo -e "  ${GREEN}${MAIL_DOMAIN}${NC}       → MX   → ${MAIL_HOSTNAME} (Priority: 10)"

    echo -e "\n${CYAN}━━━ SPF Record ━━━${NC}"
    echo -e "  ${GREEN}${MAIL_DOMAIN}${NC}       → TXT  → \"v=spf1 mx a:${MAIL_HOSTNAME} ~all\""

    echo -e "\n${CYAN}━━━ DMARC Record ━━━${NC}"
    echo -e "  ${GREEN}_dmarc.${MAIL_DOMAIN}${NC} → TXT  → \"v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}\""

    # DKIM record
    if [[ -f "/etc/opendkim/keys/${MAIL_DOMAIN}/scalara.txt" ]]; then
        echo -e "\n${CYAN}━━━ DKIM Record ━━━${NC}"
        echo -e "  ${GREEN}scalara._domainkey.${MAIL_DOMAIN}${NC} → TXT  →"
        cat "/etc/opendkim/keys/${MAIL_DOMAIN}/scalara.txt" | sed 's/^/    /'
    fi

    echo -e "\n${CYAN}━━━ PTR Record (Reverse DNS) ━━━${NC}"
    echo -e "  ${GREEN}${server_ip}${NC}  → PTR  → ${MAIL_HOSTNAME}"
    echo -e "  ${YELLOW}(Set this in your VPS provider's control panel)${NC}"

    echo ""

    # Save DNS info to file
    cat > "${CONFIG_DIR}/dns-records.txt" << EOF
# Scalara DNS Records
# Server IP: ${server_ip}
# Generated: $(date)

# A Records
${MAIL_HOSTNAME}        A       ${server_ip}
${WEBMAIL_HOSTNAME}     A       ${server_ip}

# MX Record
${MAIL_DOMAIN}          MX 10   ${MAIL_HOSTNAME}

# SPF
${MAIL_DOMAIN}          TXT     "v=spf1 mx a:${MAIL_HOSTNAME} ~all"

# DMARC
_dmarc.${MAIL_DOMAIN}  TXT     "v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}"

# PTR (Reverse DNS) – set via VPS provider
${server_ip}            PTR     ${MAIL_HOSTNAME}
EOF

    log_info "DNS records saved to ${CONFIG_DIR}/dns-records.txt"
}

# ─── Save installation info ─────────────────────────────────
save_install_info() {
    cat > "${CONFIG_DIR}/install-info.txt" << EOF
# ═══════════════════════════════════════════════════
#  Scalara Installation Information
#  Generated: $(date)
# ═══════════════════════════════════════════════════

Domain:           ${MAIL_DOMAIN}
Mail Hostname:    ${MAIL_HOSTNAME}
Webmail URL:      https://${WEBMAIL_HOSTNAME}
Server IP:        $(curl -4 -s ifconfig.me 2>/dev/null || echo "N/A")

Admin Email:      admin@${MAIL_DOMAIN}

Database:         PostgreSQL
  Host:           localhost
  Port:           5432
  Name:           scalara
  User:           scalara

Services:
  Postfix:        SMTP (25, 587, 465)
  Dovecot:        IMAP (143, 993)
  Nginx:          HTTP/HTTPS (80, 443)
  PostgreSQL:     5432
  PM2:            Scalara Webmail (port 3000)

Paths:
  Home:           ${SCALARA_HOME}
  Webmail:        ${WEBMAIL_DIR}
  Config:         ${CONFIG_DIR}
  Mail Storage:   /var/mail/vhosts/${MAIL_DOMAIN}/
  Logs:           /var/log/scalara-install.log

Config Files:
  Postfix:        /etc/postfix/main.cf
  Dovecot:        /etc/dovecot/dovecot.conf
  Nginx:          /etc/nginx/sites-available/scalara
  Webmail Env:    ${WEBMAIL_DIR}/.env

Useful Commands:
  pm2 status                    # Check webmail status
  pm2 restart scalara           # Restart webmail
  pm2 logs scalara              # View webmail logs
  systemctl status postfix      # Postfix status
  systemctl status dovecot      # Dovecot status
  systemctl status nginx        # Nginx status
  journalctl -u postfix -f      # Postfix logs
  journalctl -u dovecot -f      # Dovecot logs
EOF

    chmod 600 "${CONFIG_DIR}/install-info.txt"
    log_info "Installation info saved to ${CONFIG_DIR}/install-info.txt"
}

# ─── Print completion message ────────────────────────────────
print_completion() {
    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                                                      ║${NC}"
    echo -e "${GREEN}${BOLD}║       ✅  Scalara Installation Complete!              ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                      ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${WHITE}${BOLD}Access your webmail:${NC}"
    echo -e "  URL:      ${GREEN}https://${WEBMAIL_HOSTNAME}${NC}"
    echo -e "  Email:    ${GREEN}admin@${MAIL_DOMAIN}${NC}"
    echo -e "  Password: ${GREEN}(the password you set during installation)${NC}"
    echo ""
    echo -e "${WHITE}${BOLD}Important:${NC}"
    echo -e "  1. Add the DNS records shown above to your domain registrar"
    echo -e "  2. Set the PTR record via your VPS provider's panel"
    echo -e "  3. Wait for DNS propagation (may take up to 48 hours)"
    echo -e "  4. Test your mail server: ${CYAN}https://mxtoolbox.com${NC}"
    echo ""
    echo -e "${WHITE}${BOLD}Management:${NC}"
    echo -e "  View logs:     ${CYAN}pm2 logs scalara${NC}"
    echo -e "  Restart:       ${CYAN}pm2 restart scalara${NC}"
    echo -e "  Status:        ${CYAN}pm2 status${NC}"
    echo -e "  Install info:  ${CYAN}cat ${CONFIG_DIR}/install-info.txt${NC}"
    echo ""
    echo -e "${YELLOW}For new email accounts, create system users:${NC}"
    echo -e "  ${CYAN}sudo adduser username${NC}"
    echo -e "  Then sign up through the webmail interface."
    echo ""
}

# ═══════════════════════════════════════════════════════
#  Main Installation Flow
# ═══════════════════════════════════════════════════════
main() {
    print_banner
    preflight_checks
    collect_config

    setup_system
    setup_firewall
    setup_fail2ban
    install_postgresql
    setup_initial_ssl
    install_postfix
    install_dovecot
    install_nodejs
    install_nginx
    setup_ssl_certs
    setup_dkim
    deploy_webmail

    print_dns_instructions
    save_install_info
    print_completion
}

main "$@"
