<div align="center">

# ⬛ Scalara

### Premium Self-Hosted Webmail & Mail Server

A production-ready, dark-themed webmail application with a fully automated VPS installer for complete email hosting.

Built with **Next.js 14** · **TypeScript** · **Tailwind CSS** · **PostgreSQL** · **Postfix** · **Dovecot**

---

</div>

## Features

### Webmail Application

- **Email Management** – Inbox, Sent, Drafts, Trash, Spam, Starred, Archive
- **Rich Compose** – Full compose modal with To/CC/BCC, attachments, formatting
- **Calendar** – Month view calendar with event creation and management
- **Contacts** – Contact groups, favorites, full CRUD with phone/email fields
- **Settings** – Profile, security, notifications, appearance, mail config, server info
- **Real-time** – IMAP/SMTP integration with live mail server connectivity
- **Dark Theme** – Premium black theme (#0a0a0a) with white accents throughout

### Security

- **AES-256-GCM** encryption for stored mail passwords
- **PBKDF2** password hashing (310,000 iterations)
- **JWT sessions** with NextAuth
- **CSRF protection**, security headers (HSTS, CSP, X-Frame, etc.)
- **Zod validation** on all API inputs
- **Fail2Ban** integration for brute-force protection
- **DKIM, SPF, DMARC** email authentication

### Auto-Installer

- One-command VPS setup on **Ubuntu 22.04/24.04**
- Installs & configures **Postfix** (SMTP), **Dovecot** (IMAP), **PostgreSQL**, **Nginx**, **Node.js**, **PM2**
- **Let's Encrypt** SSL certificates with auto-renewal
- **DKIM** key generation and signing
- **UFW firewall** configuration
- Complete **DNS record** guidance
- Admin user creation
- Uninstaller included

---

## Tech Stack

| Layer           | Technology              |
| --------------- | ----------------------- |
| Framework       | Next.js 14 (App Router) |
| Language        | TypeScript              |
| Styling         | Tailwind CSS 3.4        |
| Database        | PostgreSQL + Prisma ORM |
| Auth            | NextAuth 4 (JWT)        |
| State           | Zustand 5               |
| IMAP            | ImapFlow                |
| SMTP            | Nodemailer              |
| Icons           | Lucide React            |
| Mail Server     | Postfix + Dovecot       |
| Web Server      | Nginx                   |
| Process Manager | PM2                     |
| SSL             | Let's Encrypt (Certbot) |

---

## Project Structure

```
scalara/
├── installer/                    # VPS auto-installer
│   ├── install.sh                # Main installer script
│   ├── uninstall.sh              # Uninstaller
│   ├── lib/
│   │   ├── functions.sh          # Utility functions
│   │   ├── dns.sh                # DNS utilities
│   │   └── ssl.sh                # SSL utilities
│   └── templates/
│       ├── postfix-main.cf       # Postfix config template
│       ├── dovecot.conf          # Dovecot config template
│       └── nginx.conf            # Nginx config template
│
├── webmail/                      # Next.js webmail application
│   ├── prisma/
│   │   └── schema.prisma         # Database schema (15+ models)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/     # Login page
│   │   │   ├── (dashboard)/      # Dashboard pages
│   │   │   │   ├── inbox/        # Email folders
│   │   │   │   ├── sent/
│   │   │   │   ├── drafts/
│   │   │   │   ├── trash/
│   │   │   │   ├── spam/
│   │   │   │   ├── starred/
│   │   │   │   ├── archive/
│   │   │   │   ├── calendar/     # Calendar
│   │   │   │   ├── contacts/     # Contacts
│   │   │   │   └── settings/     # Settings
│   │   │   └── api/              # API routes
│   │   ├── components/
│   │   │   ├── ui/               # Button, Input, Modal, Badge, Avatar, etc.
│   │   │   ├── layout/           # Sidebar, Header
│   │   │   ├── email/            # EmailList, EmailView, ComposeModal, Toolbar
│   │   │   ├── calendar/         # CalendarView
│   │   │   └── contacts/         # ContactList
│   │   ├── lib/                  # auth, db, mail, crypto, utils
│   │   ├── store/                # Zustand store
│   │   └── types/                # TypeScript interfaces
│   ├── package.json
│   ├── tailwind.config.ts
│   └── next.config.js
│
├── docker-compose.yml            # Docker deployment
└── README.md
```

---

## Quick Start

### Option 1: VPS Auto-Installer (Recommended)

**Requirements:** Fresh Ubuntu 22.04/24.04 VPS with 1GB+ RAM, a domain pointed to your server IP.

```bash
# Upload the scalara directory to your VPS
scp -r scalara/ root@your-server:/root/

# SSH into your server
ssh root@your-server

# Run the installer
cd /root/scalara/installer
chmod +x install.sh
sudo bash install.sh
```

The installer will:

1. Ask for your domain, admin email, and password
2. Install all required packages
3. Configure Postfix, Dovecot, PostgreSQL, Nginx
4. Obtain SSL certificates
5. Set up DKIM signing
6. Deploy the webmail application
7. Print the required DNS records

### Option 2: Development Setup

```bash
cd scalara/webmail

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database and mail server details

# Set up database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

Visit `http://localhost:3000`

---

## DNS Records

After installation, add these DNS records:

| Type | Host                               | Value                                                     |
| ---- | ---------------------------------- | --------------------------------------------------------- |
| A    | mail.yourdomain.com                | Your server IP                                            |
| A    | webmail.yourdomain.com             | Your server IP                                            |
| MX   | yourdomain.com                     | mail.yourdomain.com (Priority: 10)                        |
| TXT  | yourdomain.com                     | `v=spf1 mx a:mail.yourdomain.com ~all`                    |
| TXT  | \_dmarc.yourdomain.com             | `v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com` |
| TXT  | scalara.\_domainkey.yourdomain.com | _(DKIM key from installer output)_                        |
| PTR  | Your server IP                     | mail.yourdomain.com _(set via VPS provider)_              |

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/scalara"

# Authentication
NEXTAUTH_URL="https://webmail.yourdomain.com"
NEXTAUTH_SECRET="your-secret-key"

# Mail Server
IMAP_HOST="mail.yourdomain.com"
IMAP_PORT=993
SMTP_HOST="mail.yourdomain.com"
SMTP_PORT=587

# Encryption
ENCRYPTION_KEY="64-char-hex-key"
```

---

## Docker Deployment

```bash
cd scalara
docker-compose up -d
```

---

## Management Commands

```bash
# Webmail
pm2 status                    # Check status
pm2 restart scalara           # Restart
pm2 logs scalara              # View logs

# Mail server
systemctl status postfix      # Postfix status
systemctl status dovecot      # Dovecot status
systemctl restart postfix     # Restart Postfix
journalctl -u postfix -f      # Postfix logs
journalctl -u dovecot -f      # Dovecot logs

# SSL
certbot renew --dry-run       # Test renewal
certbot certificates          # List certificates

# Database
sudo -u postgres psql scalara # Connect to DB

# DNS verification
dig MX yourdomain.com
dig TXT yourdomain.com
```

---

## Security Checklist

- [x] TLS 1.2+ enforced for all connections
- [x] Mail passwords encrypted with AES-256-GCM
- [x] Account passwords hashed with PBKDF2 (310K iterations)
- [x] JWT session tokens with 7-day expiry
- [x] CSRF protection via NextAuth
- [x] Security headers (HSTS, X-Frame-Options, CSP, etc.)
- [x] Rate limiting on all endpoints
- [x] Fail2Ban for SSH, SMTP, and IMAP
- [x] UFW firewall with minimal open ports
- [x] DKIM, SPF, DMARC email authentication
- [x] Input validation with Zod schemas
- [x] Encrypted environment files (chmod 600)

---

## License

MIT License. Built with care for self-hosted email independence.

---

<div align="center">

**Scalara** – Own your email.

</div>
