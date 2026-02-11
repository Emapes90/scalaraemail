import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, ParsedMail } from "mailparser";
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
// IMAP Client — Fetch Emails
// ============================================

export async function createImapClient(config: MailConfig) {
  const password = decrypt(config.encryptedPassword);

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: {
      user: config.email,
      pass: password,
    },
    logger: false,
  });

  await client.connect();
  return client;
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
      const total = client.mailbox?.exists || 0;
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
        messages.push({
          uid: message.uid,
          messageId: message.envelope.messageId,
          fromAddress: message.envelope.from?.[0]?.address || "",
          fromName: message.envelope.from?.[0]?.name || null,
          toAddresses: message.envelope.to?.map((t: any) => t.address) || [],
          ccAddresses: message.envelope.cc?.map((c: any) => c.address) || [],
          subject: message.envelope.subject || "(No Subject)",
          isRead: message.flags.has("\\Seen"),
          isStarred: message.flags.has("\\Flagged"),
          hasAttachments: hasAttachmentParts(message.bodyStructure),
          size: message.size,
          sentAt: message.envelope.date?.toISOString(),
          receivedAt: message.envelope.date?.toISOString(),
        });
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
  } finally {
    await client.logout();
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

      // Mark as read
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

      return {
        messageId: parsed.messageId || "",
        fromAddress: parsed.from?.value[0]?.address || "",
        fromName: parsed.from?.value[0]?.name || null,
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
        replyTo: parsed.replyTo?.value[0]?.address,
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
        sentAt: parsed.date?.toISOString(),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
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
    await client.logout();
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
    await client.logout();
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
    await client.logout();
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
    await client.logout();
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
    await client.logout();
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
  const password = decrypt(config.encryptedPassword);

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.email,
      pass: password,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });

  const info = await transporter.sendMail({
    from: config.email,
    to: options.to.join(", "),
    cc: options.cc?.join(", "),
    bcc: options.bcc?.join(", "),
    subject: options.subject,
    text: options.text,
    html: options.html,
    inReplyTo: options.inReplyTo,
    attachments: options.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    })),
  });

  return { messageId: info.messageId, accepted: info.accepted };
}

// ============================================
// Helpers
// ============================================

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
    starred: "INBOX", // Flagged messages in INBOX
    archive: "Archive",
  };
  return map[slug] || slug;
}
