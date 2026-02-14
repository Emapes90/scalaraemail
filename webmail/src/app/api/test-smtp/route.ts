import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import nodemailer from "nodemailer";

/**
 * GET /api/test-smtp
 * Diagnostic endpoint — tests SMTP connection + auth step-by-step
 * Returns detailed status at each stage so the user knows exactly what's broken
 */
export async function GET(request: NextRequest) {
  const steps: { step: string; status: "ok" | "fail"; detail: string }[] = [];

  try {
    // Step 1: Auth
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    steps.push({ step: "Session", status: "ok", detail: session.user.email });

    // Step 2: User from DB
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) {
      steps.push({
        step: "Database",
        status: "fail",
        detail: "User not found in DB",
      });
      return NextResponse.json({ success: false, steps });
    }
    steps.push({
      step: "Database",
      status: "ok",
      detail: `smtpHost=${user.smtpHost}, smtpPort=${user.smtpPort}`,
    });

    // Step 3: Check mail password exists
    if (!user.mailPassword) {
      steps.push({
        step: "Mail Password",
        status: "fail",
        detail:
          "No mailPassword in DB. Go to Settings → Server and enter your mail password.",
      });
      return NextResponse.json({ success: false, steps });
    }
    steps.push({
      step: "Mail Password",
      status: "ok",
      detail: `Encrypted (${user.mailPassword.length} chars)`,
    });

    // Step 4: Decrypt
    let password: string;
    try {
      password = decrypt(user.mailPassword);
      if (!password) throw new Error("Empty result");
      steps.push({
        step: "Decrypt",
        status: "ok",
        detail: `Decrypted OK (${password.length} chars)`,
      });
    } catch (err: any) {
      steps.push({
        step: "Decrypt",
        status: "fail",
        detail: `Decrypt failed: ${err.message}. Go to Settings → Server and re-enter your mail password.`,
      });
      return NextResponse.json({ success: false, steps });
    }

    // Step 5: TCP + TLS + Auth
    const transporter = nodemailer.createTransport({
      host: user.smtpHost,
      port: user.smtpPort,
      secure: user.smtpPort === 465,
      auth: {
        user: user.email,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });

    try {
      await transporter.verify();
      steps.push({
        step: "SMTP Connect + Auth",
        status: "ok",
        detail: `Connected and authenticated to ${user.smtpHost}:${user.smtpPort}`,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      let detail = msg;

      if (msg.includes("ECONNREFUSED")) {
        detail = `Port ${user.smtpPort} refused. Postfix submission may not be running. SSH into VPS and check: ss -tlnp | grep ${user.smtpPort}`;
      } else if (msg.includes("ETIMEDOUT")) {
        detail = `Connection timed out to ${user.smtpHost}:${user.smtpPort}. Check firewall: ufw allow ${user.smtpPort}/tcp`;
      } else if (msg.includes("EAUTH") || msg.includes("Invalid login")) {
        detail = `Auth rejected by server. Dovecot SASL may use PAM instead of passwd-file. SSH into VPS and run the fix commands shown below.`;
      } else if (msg.includes("ESOCKET")) {
        detail = `TLS handshake failed. Check SSL certs on VPS.`;
      }

      steps.push({
        step: "SMTP Connect + Auth",
        status: "fail",
        detail,
      });
      return NextResponse.json({
        success: false,
        steps,
        fixCommands: [
          "# SSH into your VPS and run these commands:",
          "",
          "# 1. Fix Dovecot to use passwd-file auth (not PAM):",
          "sudo tee /etc/dovecot/conf.d/10-auth.conf << 'EOF'",
          "disable_plaintext_auth = yes",
          "auth_mechanisms = plain login",
          "passdb {",
          "  driver = passwd-file",
          "  args = scheme=SHA512-CRYPT /etc/dovecot/users",
          "}",
          "userdb {",
          "  driver = static",
          "  args = uid=5000 gid=5000 home=/var/mail/vhosts/%d/%n",
          "}",
          "EOF",
          "",
          "# 2. Enable submission port 587 in Postfix master.cf:",
          "grep -q '^submission' /etc/postfix/master.cf || cat >> /etc/postfix/master.cf << 'EOF'",
          "submission inet n       -       y       -       -       smtpd",
          "  -o syslog_name=postfix/submission",
          "  -o smtpd_tls_security_level=encrypt",
          "  -o smtpd_sasl_auth_enable=yes",
          "  -o smtpd_tls_auth_only=yes",
          "  -o smtpd_reject_unlisted_recipient=no",
          "  -o smtpd_client_restrictions=permit_sasl_authenticated,reject",
          "  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject",
          "  -o milter_macro_daemon_name=ORIGINATING",
          "EOF",
          "",
          "# 3. Restart both services:",
          "sudo systemctl restart dovecot",
          "sudo systemctl restart postfix",
          "",
          "# 4. Test auth from VPS:",
          `doveadm auth test ${session.user.email} YOUR_PASSWORD`,
        ],
      });
    }

    transporter.close();
    return NextResponse.json({ success: true, steps });
  } catch (err: any) {
    steps.push({ step: "Unexpected", status: "fail", detail: err.message });
    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}
