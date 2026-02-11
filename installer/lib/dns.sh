#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Installer – DNS Utilities
# ─────────────────────────────────────────────────────────────

# Verify all required DNS records
verify_dns_records() {
    local domain="$1"
    local mail_hostname="$2"
    local expected_ip="$3"
    local all_ok=true

    log_step "Verifying DNS Records"

    # Check A record for mail hostname
    log_info "Checking A record for ${mail_hostname}..."
    local a_record
    a_record=$(dig +short A "${mail_hostname}" 2>/dev/null | head -1)
    if [[ "${a_record}" == "${expected_ip}" ]]; then
        log_success "A record for ${mail_hostname} → ${a_record}"
    else
        log_warn "A record for ${mail_hostname} not found or incorrect (got: ${a_record:-none})"
        all_ok=false
    fi

    # Check MX record
    log_info "Checking MX record for ${domain}..."
    local mx_record
    mx_record=$(dig +short MX "${domain}" 2>/dev/null | head -1)
    if [[ -n "${mx_record}" ]]; then
        log_success "MX record: ${mx_record}"
    else
        log_warn "MX record for ${domain} not found"
        all_ok=false
    fi

    # Check SPF record
    log_info "Checking SPF record for ${domain}..."
    local spf_record
    spf_record=$(dig +short TXT "${domain}" 2>/dev/null | grep "v=spf1" | head -1)
    if [[ -n "${spf_record}" ]]; then
        log_success "SPF record found: ${spf_record}"
    else
        log_warn "SPF record not found"
        all_ok=false
    fi

    # Check DMARC record
    log_info "Checking DMARC record..."
    local dmarc_record
    dmarc_record=$(dig +short TXT "_dmarc.${domain}" 2>/dev/null | grep "v=DMARC1" | head -1)
    if [[ -n "${dmarc_record}" ]]; then
        log_success "DMARC record found: ${dmarc_record}"
    else
        log_warn "DMARC record not found"
        all_ok=false
    fi

    # Check DKIM record
    log_info "Checking DKIM record..."
    local dkim_record
    dkim_record=$(dig +short TXT "scalara._domainkey.${domain}" 2>/dev/null | head -1)
    if [[ -n "${dkim_record}" ]]; then
        log_success "DKIM record found"
    else
        log_warn "DKIM record not found (add it after installation)"
        all_ok=false
    fi

    # Check PTR record
    log_info "Checking PTR (reverse DNS) record..."
    local ptr_record
    ptr_record=$(dig +short -x "${expected_ip}" 2>/dev/null | head -1)
    if [[ -n "${ptr_record}" ]]; then
        log_success "PTR record: ${ptr_record}"
    else
        log_warn "PTR record not configured (set via your VPS provider)"
        all_ok=false
    fi

    if ${all_ok}; then
        log_success "All DNS records verified successfully!"
    else
        log_warn "Some DNS records are missing. The installer will continue,"
        log_warn "but email delivery may be affected until all records are set."
    fi

    return 0
}

# Generate DNS zone file
generate_zone_file() {
    local domain="$1"
    local mail_hostname="$2"
    local server_ip="$3"
    local output_file="$4"

    cat > "${output_file}" << EOF
; ═══════════════════════════════════════════════
;  Scalara DNS Zone File for ${domain}
;  Generated: $(date)
;  Import this into your DNS provider
; ═══════════════════════════════════════════════

\$TTL    3600

; ─── A Records ───
${mail_hostname}.    IN  A       ${server_ip}
${domain}.           IN  A       ${server_ip}

; ─── MX Record ───
${domain}.           IN  MX  10  ${mail_hostname}.

; ─── SPF Record ───
${domain}.           IN  TXT     "v=spf1 mx a:${mail_hostname} ~all"

; ─── DMARC Record ───
_dmarc.${domain}.    IN  TXT     "v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}"

; ─── DKIM Record ───
; Add the DKIM record from: /etc/opendkim/keys/${domain}/scalara.txt

; ─── Autodiscover (Outlook) ───
_autodiscover._tcp.${domain}. IN SRV 0 0 443 ${mail_hostname}.

; ─── Autoconfig (Thunderbird) ───
autoconfig.${domain}. IN CNAME ${mail_hostname}.

; ─── PTR Record ───
; Set reverse DNS via your VPS provider's control panel:
; ${server_ip} → ${mail_hostname}
EOF

    log_success "Zone file generated: ${output_file}"
}

# Wait for DNS propagation
wait_for_dns() {
    local domain="$1"
    local expected_ip="$2"
    local max_wait="${3:-300}"
    local check_interval=10
    local elapsed=0

    log_info "Waiting for DNS propagation for ${domain}..."

    while [[ ${elapsed} -lt ${max_wait} ]]; do
        local current_ip
        current_ip=$(dig +short A "${domain}" @8.8.8.8 2>/dev/null | head -1)

        if [[ "${current_ip}" == "${expected_ip}" ]]; then
            log_success "DNS propagated for ${domain} → ${expected_ip}"
            return 0
        fi

        sleep ${check_interval}
        elapsed=$((elapsed + check_interval))
        echo -ne "\r  Waiting... ${elapsed}s / ${max_wait}s"
    done

    echo ""
    log_warn "DNS not yet propagated after ${max_wait}s. This is normal – it can take up to 48 hours."
    return 1
}
