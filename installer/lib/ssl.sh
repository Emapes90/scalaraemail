#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Installer – SSL Utilities
# ─────────────────────────────────────────────────────────────

# Install certbot if not present
ensure_certbot() {
    if ! command_exists certbot; then
        log_info "Installing Certbot..."
        apt-get install -y -qq certbot python3-certbot-nginx
        log_success "Certbot installed"
    fi
}

# Obtain SSL certificate with retry logic
obtain_ssl_cert() {
    local domain="$1"
    local email="$2"
    local webroot="${3:-}"
    local max_attempts=3
    local attempt=1

    ensure_certbot

    while [[ ${attempt} -le ${max_attempts} ]]; do
        log_info "Obtaining SSL certificate for ${domain} (attempt ${attempt}/${max_attempts})..."

        local certbot_args=(
            certonly
            --non-interactive
            --agree-tos
            --email "${email}"
            -d "${domain}"
        )

        if [[ -n "${webroot}" ]]; then
            certbot_args+=(--webroot -w "${webroot}")
        else
            certbot_args+=(--standalone)
        fi

        if certbot "${certbot_args[@]}" 2>/dev/null; then
            log_success "SSL certificate obtained for ${domain}"
            return 0
        fi

        log_warn "Attempt ${attempt} failed for ${domain}"
        attempt=$((attempt + 1))
        sleep 5
    done

    log_error "Failed to obtain SSL certificate for ${domain} after ${max_attempts} attempts"
    log_info "You can try manually later: certbot certonly --standalone -d ${domain}"
    return 1
}

# Check if a certificate exists and is valid
check_ssl_cert() {
    local domain="$1"
    local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"

    if [[ ! -f "${cert_path}" ]]; then
        return 1
    fi

    # Check expiry
    local expiry
    expiry=$(openssl x509 -enddate -noout -in "${cert_path}" 2>/dev/null | cut -d= -f2)

    if [[ -z "${expiry}" ]]; then
        return 1
    fi

    local expiry_epoch
    expiry_epoch=$(date -d "${expiry}" +%s 2>/dev/null)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [[ ${days_left} -gt 0 ]]; then
        log_info "SSL cert for ${domain}: ${days_left} days until expiry"
        return 0
    fi

    log_warn "SSL cert for ${domain} has expired or is expiring soon"
    return 1
}

# Setup auto-renewal
setup_ssl_renewal() {
    log_info "Setting up SSL auto-renewal..."

    # Create renewal hook to restart services
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy

    cat > /etc/letsencrypt/renewal-hooks/deploy/scalara-reload.sh << 'EOF'
#!/bin/bash
# Reload services after SSL renewal
systemctl reload nginx 2>/dev/null || true
systemctl restart dovecot 2>/dev/null || true
systemctl restart postfix 2>/dev/null || true
EOF

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/scalara-reload.sh

    # Enable certbot timer
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true

    # Create cron fallback
    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook '/etc/letsencrypt/renewal-hooks/deploy/scalara-reload.sh'") | crontab -
    fi

    log_success "SSL auto-renewal configured"
}

# Generate self-signed certificate (fallback)
generate_self_signed_cert() {
    local domain="$1"
    local cert_dir="/etc/letsencrypt/live/${domain}"

    log_warn "Generating self-signed certificate for ${domain} (temporary)"

    mkdir -p "${cert_dir}"

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${cert_dir}/privkey.pem" \
        -out "${cert_dir}/fullchain.pem" \
        -subj "/CN=${domain}" \
        2>/dev/null

    log_success "Self-signed certificate generated for ${domain}"
    log_warn "Replace with a real certificate using: certbot certonly -d ${domain}"
}
