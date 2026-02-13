"use client";

import React, { useState, useEffect } from "react";
import { useMailStore } from "@/store/useMailStore";
import { EmailList } from "@/components/email/EmailList";
import { EmailView } from "@/components/email/EmailView";
import { EmailToolbar } from "@/components/email/EmailToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { Trash2 } from "lucide-react";
import type { Email } from "@/types";

export default function TrashPage() {
  const {
    emails,
    setEmails,
    setActiveFolder,
    removeEmails,
    isLoading,
    setLoading,
    searchQuery,
    setComposing,
  } = useMailStore();
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);

  useEffect(() => {
    setActiveFolder("trash");
    loadEmails();
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails?folder=trash&page=1&pageSize=50");
      const data = await res.json();
      if (data.success) setEmails(data.data.emails);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailClick = async (email: Email) => {
    setViewingEmail(email);
    try {
      const res = await fetch(`/api/emails/${email.uid}?folder=trash`);
      const data = await res.json();
      if (data.success) setViewingEmail({ ...email, ...data.data });
    } catch (e) {
      console.error(e);
    }
  };

  const handleBack = () => setViewingEmail(null);

  const handleDelete = async () => {
    const uid = viewingEmail?.uid;
    if (!uid) return;
    try {
      await fetch(`/api/emails/${uid}?folder=trash`, { method: "DELETE" });
      removeEmails([String(uid)]);
      handleBack();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async () => {
    const uid = viewingEmail?.uid;
    if (!uid) return;
    try {
      await fetch(`/api/emails/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          folder: "trash",
          targetFolder: "inbox",
        }),
      });
      removeEmails([String(uid)]);
      handleBack();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredEmails = searchQuery
    ? emails.filter((e) =>
        e.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : emails;

  const handleReply = () => {
    if (!viewingEmail) return;
    const originalText = viewingEmail.bodyText || "";
    const quotedBody = `\n\n\nOn ${new Date(viewingEmail.sentAt || viewingEmail.receivedAt).toLocaleString()}, ${viewingEmail.fromName || viewingEmail.fromAddress} wrote:\n> ${originalText.split("\n").join("\n> ")}`;
    setComposing(true, {
      to: [viewingEmail.fromAddress],
      subject: viewingEmail.subject?.startsWith("Re:")
        ? viewingEmail.subject
        : `Re: ${viewingEmail.subject}`,
      body: quotedBody,
      inReplyTo: viewingEmail.messageId,
    });
  };

  const handleForward = () => {
    if (!viewingEmail) return;
    const messageBody =
      viewingEmail.bodyText || (viewingEmail.bodyHtml ? "(HTML content)" : "");
    setComposing(true, {
      subject: viewingEmail.subject?.startsWith("Fwd:")
        ? viewingEmail.subject
        : `Fwd: ${viewingEmail.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${viewingEmail.fromName || viewingEmail.fromAddress}\nDate: ${new Date(viewingEmail.sentAt || viewingEmail.receivedAt).toLocaleString()}\nSubject: ${viewingEmail.subject}\nTo: ${viewingEmail.toAddresses?.join(", ") || ""}\n\n${messageBody}`,
    });
  };

  if (isLoading) return <PageLoader />;
  if (viewingEmail)
    return (
      <EmailView
        email={viewingEmail}
        onBack={handleBack}
        onReply={handleReply}
        onReplyAll={handleReply}
        onForward={handleForward}
        onDelete={handleDelete}
        onArchive={handleRestore}
        onToggleStar={() => {}}
      />
    );

  return (
    <div className="flex flex-col h-full">
      <EmailToolbar
        onMarkRead={() => {}}
        onMarkUnread={() => {}}
        onDelete={handleDelete}
        onArchive={handleRestore}
        onSpam={() => {}}
        onStar={() => {}}
      />
      {filteredEmails.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-10 w-10" />}
          title="Trash is empty"
          description="Deleted messages will appear here for 30 days."
        />
      ) : (
        <EmailList emails={filteredEmails} onEmailClick={handleEmailClick} />
      )}
    </div>
  );
}
