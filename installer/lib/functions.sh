#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Scalara Installer – Utility Functions
# ─────────────────────────────────────────────────────────────

# Generate a random password of given length
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $((length * 2)) | tr -dc 'A-Za-z0-9!@#$%^&*' | head -c "${length}"
}

# Check if a command exists
command_exists() {
    command -v "$1" &>/dev/null
}

# Check if a service is running
service_running() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

# Wait for a service to start
wait_for_service() {
    local service="$1"
    local timeout="${2:-30}"
    local count=0

    while ! service_running "${service}"; do
        sleep 1
        count=$((count + 1))
        if [[ ${count} -ge ${timeout} ]]; then
            log_error "Service ${service} failed to start within ${timeout}s"
            return 1
        fi
    done
    return 0
}

# Check if a port is open
port_is_open() {
    local port="$1"
    ss -tlnp | grep -q ":${port} "
}

# Get the server's public IP
get_public_ip() {
    curl -4 -s ifconfig.me 2>/dev/null \
        || curl -4 -s api.ipify.org 2>/dev/null \
        || curl -4 -s icanhazip.com 2>/dev/null \
        || hostname -I | awk '{print $1}'
}

# Validate domain format
validate_domain() {
    local domain="$1"
    if [[ "${domain}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
        return 0
    fi
    return 1
}

# Validate email format
validate_email() {
    local email="$1"
    if [[ "${email}" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        return 0
    fi
    return 1
}

# Backup a file with timestamp
backup_file() {
    local file="$1"
    if [[ -f "${file}" ]]; then
        cp "${file}" "${file}.bak.$(date +%Y%m%d_%H%M%S)"
    fi
}

# Create a system user for email
create_mail_user() {
    local username="$1"
    local password="$2"
    local domain="$3"

    # Create system user
    if ! id "${username}" &>/dev/null; then
        useradd -m -s /usr/sbin/nologin "${username}"
        echo "${username}:${password}" | chpasswd
    fi

    # Create maildir
    local maildir="/var/mail/vhosts/${domain}/${username}"
    mkdir -p "${maildir}"/{cur,new,tmp}
    chown -R vmail:vmail "${maildir}"
    chmod -R 700 "${maildir}"

    log_success "Mail user ${username}@${domain} created"
}

# Check DNS record
check_dns_record() {
    local record_type="$1"
    local domain="$2"

    local result
    result=$(dig +short "${record_type}" "${domain}" 2>/dev/null)

    if [[ -n "${result}" ]]; then
        echo "${result}"
        return 0
    fi
    return 1
}

# Test SMTP connection
test_smtp() {
    local host="$1"
    local port="${2:-25}"

    if timeout 5 bash -c "echo QUIT | nc -q 1 ${host} ${port}" &>/dev/null; then
        return 0
    fi
    return 1
}

# Get disk usage percentage
get_disk_usage() {
    df -h / | awk 'NR==2 {print $5}' | tr -d '%'
}

# Get memory usage percentage
get_memory_usage() {
    free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}'
}

# Sanitize input (remove dangerous characters)
sanitize_input() {
    local input="$1"
    echo "${input}" | sed 's/[^a-zA-Z0-9._@-]//g'
}

# Print a separator line
print_separator() {
    echo -e "${CYAN}$(printf '━%.0s' {1..60})${NC}"
}

# Confirm action
confirm_action() {
    local message="$1"
    local default="${2:-n}"

    if [[ "${default}" == "y" ]]; then
        read -rp "$(echo -e "${YELLOW}${message} (Y/n):${NC} ")" response
        response="${response:-y}"
    else
        read -rp "$(echo -e "${YELLOW}${message} (y/N):${NC} ")" response
        response="${response:-n}"
    fi

    [[ "${response}" =~ ^[Yy]$ ]]
}

# Retry a command with backoff
retry_command() {
    local max_attempts="${1:-3}"
    local delay="${2:-5}"
    shift 2
    local cmd="$@"

    local attempt=1
    while [[ ${attempt} -le ${max_attempts} ]]; do
        if eval "${cmd}"; then
            return 0
        fi
        log_warn "Attempt ${attempt}/${max_attempts} failed. Retrying in ${delay}s..."
        sleep "${delay}"
        attempt=$((attempt + 1))
        delay=$((delay * 2))
    done

    log_error "Command failed after ${max_attempts} attempts: ${cmd}"
    return 1
}
