# Scalara — Self-Hosted Email Platform

Full-featured email hosting with a modern webmail interface.

## Architecture

```
┌─────────────────────────────────┐      ┌──────────────────────────────┐
│         VPS (Engine)            │      │   Vercel / Node.js Host      │
│                                 │      │                              │
│  ┌───────────┐ ┌────────────┐   │      │  ┌────────────────────────┐  │
│  │  Postfix   │ │  Dovecot   │   │◄────►│  │   Scalara Webmail     │  │
│  │ SMTP:25/587│ │ IMAP:993   │   │IMAP  │  │   (Next.js 14)        │  │
│  └───────────┘ └────────────┘   │SMTP  │  └────────────────────────┘  │
│  ┌───────────┐ ┌────────────┐   │      │           │                  │
│  │ OpenDKIM  │ │ Fail2Ban   │   │      │           │ Prisma ORM       │
│  └───────────┘ └────────────┘   │      │           │                  │
│  ┌──────────────────────────┐   │      └───────────┼──────────────────┘
│  │  PostgreSQL (port 5432)  │◄──┼──────────────────┘
│  │  Remote SSL access       │   │      DATABASE_URL
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

**VPS** runs only the email engine + database (low resource usage).  
**Webmail** is hosted separately on Vercel (free tier, zero config) or any Node.js host.

---

## Step 1: VPS Setup (Email Engine)

### Requirements

- Ubuntu 22.04 / 24.04 or Debian 11+ VPS
- Minimum 512MB RAM, 10GB disk
- A domain name (e.g. `example.com`)
- Root/sudo access

### Install

```bash
# Upload the scalara folder to your VPS, then:
cd scalara/installer
sudo bash install.sh
```

The installer will:

1. Install PostgreSQL + configure remote access (SSL)
2. Install Postfix (SMTP) + Dovecot (IMAP)
3. Setup OpenDKIM (email signing)
4. Configure Fail2Ban + UFW firewall
5. Obtain Let's Encrypt SSL certificates
6. Create the database schema
7. Create your admin email account
8. Generate webmail environment variables
9. Install the admin management script

### After Installation

The installer outputs the webmail environment variables. You can view them anytime:

```bash
sudo cat /opt/scalara/config/webmail.env
```

---

## Step 2: DNS Configuration

Add these records in **Cloudflare** (or your domain registrar):

| Type    | Host                             | Value                                                  | Proxy               |
| ------- | -------------------------------- | ------------------------------------------------------ | ------------------- |
| **A**   | `mail.example.com`               | `YOUR_VPS_IP`                                          | DNS only (no proxy) |
| **MX**  | `example.com`                    | `mail.example.com` (Priority: 10)                      | -                   |
| **TXT** | `example.com`                    | `v=spf1 mx a:mail.example.com ~all`                    | -                   |
| **TXT** | `_dmarc.example.com`             | `v=DMARC1; p=quarantine; rua=mailto:admin@example.com` | -                   |
| **TXT** | `scalara._domainkey.example.com` | _(shown during installation)_                          | -                   |

> **Important:** The `mail.` A record must be "DNS only" (gray cloud in Cloudflare), not proxied.

### PTR Record (Reverse DNS)

Set via your VPS provider's control panel:

- `YOUR_VPS_IP` → `mail.example.com`

---

## Step 3: Deploy Webmail to Vercel

### Option A: Vercel (Recommended)

1. **Push to GitHub:**

   ```bash
   cd scalara
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USER/scalara.git
   git push -u origin main
   ```

2. **Import in Vercel:**
   - Go to [vercel.com](https://vercel.com) → **New Project**
   - Import your GitHub repository
   - **Root Directory:** `webmail`
   - **Framework:** Next.js (auto-detected)

3. **Environment Variables:**

   In Vercel project settings → Environment Variables, add all variables from `/opt/scalara/config/webmail.env` on your VPS:

   | Variable          | Value                                                               |
   | ----------------- | ------------------------------------------------------------------- |
   | `DATABASE_URL`    | `postgresql://scalara:PASSWORD@VPS_IP:5432/scalara?sslmode=require` |
   | `NEXTAUTH_URL`    | `https://your-webmail-domain.com`                                   |
   | `NEXTAUTH_SECRET` | _(from webmail.env)_                                                |
   | `IMAP_HOST`       | `mail.example.com`                                                  |
   | `IMAP_PORT`       | `993`                                                               |
   | `SMTP_HOST`       | `mail.example.com`                                                  |
   | `SMTP_PORT`       | `587`                                                               |
   | `ENCRYPTION_KEY`  | _(from webmail.env)_                                                |

4. **Deploy** and add your custom domain in Vercel settings.

5. **Prisma on Vercel:**

   Add this build command in Vercel settings:

   ```
   npx prisma generate && next build
   ```

### Option B: Self-Hosted (Docker)

If you prefer hosting the webmail on a different server:

```bash
cd scalara
cp webmail/.env.example webmail/.env
# Edit webmail/.env with values from VPS's /opt/scalara/config/webmail.env
docker compose up -d
```

### Option C: Self-Hosted (PM2 / Bare Metal)

```bash
cd scalara/webmail
cp .env.example .env
# Edit .env with values from VPS
npm install --legacy-peer-deps
npx prisma generate
npm run build
npm start
# Or with PM2:
pm2 start npm --name "scalara" -- start
```

---

## Step 4: Add Custom Domain

### For Vercel

1. Go to Vercel → Project Settings → Domains
2. Add `mail.example.com` (or `webmail.example.com`)
3. Add the CNAME record Vercel shows you in Cloudflare

### For Cloudflare DNS

| Type      | Host      | Value                     |
| --------- | --------- | ------------------------- |
| **CNAME** | `webmail` | `your-project.vercel.app` |

> The webmail domain CAN be proxied through Cloudflare (orange cloud).

---

## Admin Management

Manage email accounts, DNS, services from the VPS:

```bash
sudo scalara-admin
```

### Features

| #   | Feature          | Description                            |
| --- | ---------------- | -------------------------------------- |
| 1   | Create Email     | Add new email account                  |
| 2   | Delete Email     | Remove email account                   |
| 3   | List Emails      | Show all accounts + mailbox sizes      |
| 4   | Change Password  | Update email password                  |
| 5   | Change Quota     | Manage mailbox quota                   |
| 6   | Service Status   | Check all services                     |
| 7   | Restart Services | Restart Postfix/Dovecot/PostgreSQL     |
| 8   | View Logs        | SMTP, IMAP, PostgreSQL, Fail2Ban logs  |
| 9   | Show DNS         | Display required DNS records           |
| 10  | Verify DNS       | Check DNS configuration                |
| 11  | SSL Status       | Certificate expiry info                |
| 12  | Renew SSL        | Renew Let's Encrypt certs              |
| 13  | Server Info      | CPU, RAM, disk, database stats         |
| 14  | Backup           | Full backup (mail + database + config) |
| 15  | Test Email       | Send test email                        |
| 16  | Add Domain       | Add new domain for emails              |
| 17  | Show Env         | Display webmail environment variables  |

---

## Webmail Features

- Dark theme UI (Tailwind CSS)
- Inbox, Sent, Drafts, Trash, Spam, Starred, Archive folders
- Compose, reply, forward emails with attachments
- Contact management + groups
- Calendar with events
- Email search and filters
- Settings (signature, theme, password change)
- Mobile responsive

---

## Tech Stack

| Component      | Technology                                   |
| -------------- | -------------------------------------------- |
| **Webmail**    | Next.js 14, TypeScript, Tailwind CSS 3.4     |
| **Auth**       | NextAuth.js 4 (JWT + PBKDF2)                 |
| **Database**   | PostgreSQL + Prisma ORM                      |
| **State**      | Zustand 5                                    |
| **Email**      | ImapFlow (IMAP) + Nodemailer (SMTP)          |
| **Encryption** | AES-256-GCM (mail passwords), PBKDF2 (login) |
| **MTA**        | Postfix (SMTP) + Dovecot (IMAP/LMTP)         |
| **Security**   | OpenDKIM, SPF, DMARC, Fail2Ban, UFW, SSL     |

---

## Security

- PBKDF2 password hashing (100,000 iterations, SHA-512, 64-byte key)
- AES-256-GCM encryption for stored mail credentials
- SSL/TLS on all connections (IMAP, SMTP, PostgreSQL, HTTPS)
- Fail2Ban brute-force protection (SSH, SMTP, IMAP, PostgreSQL)
- UFW firewall with minimal open ports
- DKIM email signing + SPF + DMARC policies

---

## Troubleshooting

### Webmail can't connect to database

```bash
# On VPS, check PostgreSQL is listening on all interfaces:
sudo ss -tlnp | grep 5432

# Check pg_hba.conf allows remote:
sudo cat /etc/postgresql/*/main/pg_hba.conf | grep scalara

# Test from webmail server:
psql "postgresql://scalara:PASSWORD@VPS_IP:5432/scalara?sslmode=require"
```

### Webmail can't connect to IMAP/SMTP

```bash
# On VPS, check Dovecot is running:
sudo systemctl status dovecot

# Test IMAP from webmail server:
openssl s_client -connect mail.example.com:993

# Check Fail2Ban isn't blocking your IP:
sudo fail2ban-client status dovecot
```

### Emails going to spam

1. Check DNS records: `sudo scalara-admin` → Option 10 (Verify DNS)
2. Set PTR record via VPS provider
3. Test at [mail-tester.com](https://mail-tester.com)
4. Check DKIM: `dig TXT scalara._domainkey.example.com`

### SSL certificate issues

```bash
# Renew manually:
sudo certbot certonly --standalone -d mail.example.com
sudo systemctl restart postfix dovecot
```

---

## Uninstall

```bash
cd scalara/installer
sudo bash uninstall.sh
```

---

## License

MIT
