import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { simpleParser } from "mailparser";
import { decrypt } from "@/lib/crypto";

interface MailConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  email: string;
  encryptedPassword: string;
}

// ============================================
// IMAP Client — with proper error handling
// ============================================

async function createImapClient(config: MailConfig): Promise<ImapFlow> {
  let password: string;
  try {
    password = decrypt(config.encryptedPassword);
  } catch (err) {
    throw new Error(
      "Failed to decrypt mail password. Please re-enter your mail password in settings.",
    );
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: {
      user: config.email,
      pass: password,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });

  try {
    await client.connect();
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (
      msg.includes("AUTHENTICATIONFAILED") ||
      msg.includes("Invalid credentials")
    ) {
      throw new Error(
        "Mail authentication failed. Check your email/password in settings.",
      );
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) {
      throw new Error(
        `Cannot connect to mail server ${config.imapHost}:${config.imapPort}. Check server settings.`,
      );
    }
    throw new Error(`Mail server connection failed: ${msg}`);
  }

  return client;
}

async function safeLogout(client: ImapFlow) {
  try {
    await client.logout();
  } catch {
    // Ignore logout errors
  }
}

export async function fetchEmails(
  config: MailConfig,
  folder: string = "INBOX",
  page: number = 1,
  pageSize: number = 50,
) {
  const client = await createImapClient(config);

  try {
    const lock = await client.getMailboxLock(folder);

    try {
      const messages: any[] = [];
      const total = (client.mailbox && client.mailbox.exists) || 0;

      if (total === 0) {
        return { messages: [], total: 0, page, pageSize, hasMore: false };
      }

      const start = Math.max(1, total - page * pageSize + 1);
      const end = Math.max(1, total - (page - 1) * pageSize);
      const range = `${start}:${end}`;

      for await (const message of client.fetch(range, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        size: true,
      })) {
        try {
          messages.push({
            id: String(message.uid),
            uid: message.uid,
            messageId: message.envelope?.messageId || "",
            fromAddress: message.envelope?.from?.[0]?.address || "unknown",
            fromName: message.envelope?.from?.[0]?.name || null,
            toAddresses:
              message.envelope?.to
                ?.map((t: any) => t.address)
                .filter(Boolean) || [],
            ccAddresses:
              message.envelope?.cc
                ?.map((c: any) => c.address)
                .filter(Boolean) || [],
            subject: message.envelope?.subject || "(No Subject)",
            isRead: message.flags?.has("\\Seen") || false,
            isStarred: message.flags?.has("\\Flagged") || false,
            hasAttachments: hasAttachmentParts(message.bodyStructure),
            size: message.size || 0,
            sentAt:
              message.envelope?.date?.toISOString() || new Date().toISOString(),
            receivedAt:
              message.envelope?.date?.toISOString() || new Date().toISOString(),
          });
        } catch {
          // Skip malformed messages
        }
      }

      return {
        messages: messages.reverse(),
        total,
        page,
        pageSize,
        hasMore: start > 1,
      };
    } finally {
      lock.release();
    }
  } catch (err: any) {
    if (
      err.message?.includes("Mailbox doesn't exist") ||
      err.message?.includes("NONEXISTENT")
    ) {
      return { messages: [], total: 0, page, pageSize, hasMore: false };
    }
    throw err;
  } finally {
    await safeLogout(client);
  }
}

export async function fetchEmailContent(
  config: MailConfig,
  folder: string,
  uid: number,
) {
  const client = await createImapClient(config);

  try {
    const lock = await client.getMailboxLock(folder);

    try {
      const source = await client.download(String(uid), undefined, {
        uid: true,
      });
      const parsed = await simpleParser(source.content);

      // Mark as read (non-blocking)
      client
        .messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
        .catch(() => {});

      return {
        messageId: parsed.messageId || "",
        fromAddress: parsed.from?.value?.[0]?.address || "unknown",
        fromName: parsed.from?.value?.[0]?.name || null,
        toAddresses: parsed.to
          ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((t) =>
              t.value.map((v) => v.address || ""),
            )
          : [],
        ccAddresses: parsed.cc
          ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((c) =>
              c.value.map((v) => v.address || ""),
            )
          : [],
        replyTo: parsed.replyTo?.value?.[0]?.address,
        subject: parsed.subject || "(No Subject)",
        bodyText: parsed.text || null,
        bodyHtml: parsed.html || null,
        attachments:
          parsed.attachments?.map((att) => ({
            filename: att.filename || "attachment",
            contentType: att.contentType,
            size: att.size,
            contentId: att.contentId,
          })) || [],
        sentAt: parsed.date?.toISOString() || new Date().toISOString(),
      };
    } finally {
      lock.release();
    }
  } finally {
    await safeLogout(client);
  }
}

export async function moveEmail(
  config: MailConfig,
  fromFolder: string,
  uid: number,
  toFolder: string,
) {
  const client = await createImapClient(config);
  try {
    const lock = await client.getMailboxLock(fromFolder);
    try {
      await client.messageMove(String(uid), toFolder, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await safeLogout(client);
  }
}

export async function deleteEmail(
  config: MailConfig,
  folder: string,
  uid: number,
) {
  const client = await createImapClient(config);
  try {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await safeLogout(client);
  }
}

export async function toggleEmailFlag(
  config: MailConfig,
  folder: string,
  uid: number,
  flag: string,
  enable: boolean,
) {
  const client = await createImapClient(config);
  try {
    const lock = await client.getMailboxLock(folder);
    try {
      if (enable) {
        await client.messageFlagsAdd(String(uid), [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(String(uid), [flag], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await safeLogout(client);
  }
}

export async function getFolderList(config: MailConfig) {
  const client = await createImapClient(config);
  try {
    const folders = await client.list();
    return folders.map((folder) => ({
      name: folder.name,
      path: folder.path,
      specialUse: folder.specialUse,
      delimiter: folder.delimiter,
    }));
  } finally {
    await safeLogout(client);
  }
}

export async function getUnreadCount(
  config: MailConfig,
  folder: string = "INBOX",
) {
  const client = await createImapClient(config);
  try {
    const status = await client.status(folder, {
      unseen: true,
      messages: true,
    });
    return { unseen: status.unseen || 0, total: status.messages || 0 };
  } finally {
    await safeLogout(client);
  }
}

// ============================================
// SMTP — Send Email
// ============================================

export async function sendEmail(
  config: MailConfig,
  options: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    inReplyTo?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  },
) {
  let password: string;
  try {
    password = decrypt(config.encryptedPassword);
    if (!password || password.length === 0) {
      throw new Error("Decrypted password is empty");
    }
  } catch (err: any) {
    console.error(
      "SMTP decrypt failed for",
      config.email,
      "—",
      err?.message || err,
    );
    throw new Error(
      "Failed to decrypt mail password. Go to Settings → Server and re-enter your mail password.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.email,
      pass: password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });

  try {
    // Build raw RFC822 message first (so we can both send AND save to Sent)
    const mailOptions = {
      from: config.email,
      to: options.to.join(", "),
      cc: options.cc?.length ? options.cc.join(", ") : undefined,
      bcc: options.bcc?.length ? options.bcc.join(", ") : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html,
      inReplyTo: options.inReplyTo,
      attachments: options.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    };

    const info = await transporter.sendMail(mailOptions);

    // Append sent message to IMAP "Sent" folder so it shows up in webmail
    try {
      const composer = new MailComposer({
        from: config.email,
        to: options.to.join(", "),
        cc: options.cc?.length ? options.cc.join(", ") : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        inReplyTo: options.inReplyTo,
        messageId: info.messageId,
        date: new Date(),
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      });
      const rawMessage = await compiler_build(composer);

      const imapClient = await createImapClient(config);
      try {
        await imapClient.append("Sent", rawMessage, ["\\Seen"]);
      } finally {
        await safeLogout(imapClient);
      }
    } catch (appendErr: any) {
      // Don't fail the send if Sent append fails — email was already sent
      console.error(
        "Failed to append to Sent folder:",
        appendErr?.message || appendErr,
      );
    }

    return { messageId: info.messageId, accepted: info.accepted };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(
      `SMTP send failed: ${msg} | host=${config.smtpHost}:${config.smtpPort} user=${config.email}`,
    );
    if (msg.includes("EAUTH") || msg.includes("Invalid login")) {
      throw new Error(
        "SMTP authentication failed. Go to Settings → Server and re-enter your mail password.",
      );
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) {
      throw new Error(
        `Cannot connect to SMTP server ${config.smtpHost}:${config.smtpPort}. Check that the server is running.`,
      );
    }
    if (msg.includes("ESOCKET") || msg.includes("ECONNRESET")) {
      throw new Error(
        `Connection to ${config.smtpHost}:${config.smtpPort} was reset. Try again or check TLS settings.`,
      );
    }
    throw new Error(`Failed to send email: ${msg}`);
  }
}

// ============================================
// Helpers
// ============================================

function compiler_build(
  composer: InstanceType<typeof MailComposer>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    composer.compile().build((err: any, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

function hasAttachmentParts(structure: any): boolean {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (structure.childNodes) {
    return structure.childNodes.some((child: any) => hasAttachmentParts(child));
  }
  return false;
}

export function mapImapFolderName(slug: string): string {
  const map: Record<string, string> = {
    inbox: "INBOX",
    sent: "Sent",
    drafts: "Drafts",
    trash: "Trash",
    spam: "Junk",
    starred: "INBOX",
    archive: "Archive",
  };
  return map[slug] || slug;
}
