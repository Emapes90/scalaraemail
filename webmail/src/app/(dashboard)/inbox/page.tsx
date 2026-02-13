"use client";

import React, { useState, useEffect } from "react";
import { useMailStore } from "@/store/useMailStore";
import { EmailList } from "@/components/email/EmailList";
import { EmailView } from "@/components/email/EmailView";
import { EmailToolbar } from "@/components/email/EmailToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { Inbox as InboxIcon } from "lucide-react";
import type { Email } from "@/types";

export default function InboxPage() {
  const {
    emails,
    setEmails,
    setActiveEmail,
    searchQuery,
    setActiveFolder,
    setComposing,
    updateEmail,
    removeEmails,
    isLoading,
    setLoading,
  } = useMailStore();

  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);

  useEffect(() => {
    setActiveFolder("inbox");
    loadEmails();
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/emails?folder=inbox&page=1&pageSize=50`,
      );
      const data = await response.json();
      if (data.success) {
        setEmails(data.data.emails);
      }
    } catch (error) {
      console.error("Failed to load emails:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailClick = async (email: Email) => {
    setViewingEmail(email);
    setActiveEmail(email);

    // Fetch full content
    try {
      const response = await fetch(`/api/emails/${email.uid}?folder=inbox`);
      const data = await response.json();
      if (data.success) {
        const fullEmail = { ...email, ...data.data };
        setViewingEmail(fullEmail);
        updateEmail(email.id, { isRead: true });
      }
    } catch (error) {
      console.error("Failed to load email content:", error);
    }
  };

  const handleBack = () => {
    setViewingEmail(null);
    setActiveEmail(null);
  };

  const handleAction = async (action: string, emailId?: string) => {
    const uid = emailId || viewingEmail?.uid;
    if (!uid) return;

    try {
      await fetch(`/api/emails/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, folder: "inbox" }),
      });

      if (action === "trash" || action === "archive" || action === "spam") {
        removeEmails([String(uid)]);
        if (viewingEmail) handleBack();
      }

      if (action === "star") updateEmail(String(uid), { isStarred: true });
      if (action === "unstar") updateEmail(String(uid), { isStarred: false });
      if (action === "markRead") updateEmail(String(uid), { isRead: true });
      if (action === "markUnread") updateEmail(String(uid), { isRead: false });
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
    }
  };

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

  const handleReplyAll = () => {
    if (!viewingEmail) return;
    const originalText = viewingEmail.bodyText || "";
    const quotedBody = `\n\n\nOn ${new Date(viewingEmail.sentAt || viewingEmail.receivedAt).toLocaleString()}, ${viewingEmail.fromName || viewingEmail.fromAddress} wrote:\n> ${originalText.split("\n").join("\n> ")}`;
    setComposing(true, {
      to: [viewingEmail.fromAddress, ...(viewingEmail.toAddresses || [])],
      cc: viewingEmail.ccAddresses || [],
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

  // Filter emails by search
  const filteredEmails = searchQuery
    ? emails.filter(
        (e) =>
          e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.fromName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.snippet?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : emails;

  if (isLoading) {
    return <PageLoader />;
  }

  // Email View Mode
  if (viewingEmail) {
    return (
      <EmailView
        email={viewingEmail}
        onBack={handleBack}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onForward={handleForward}
        onDelete={() => handleAction("trash")}
        onArchive={() => handleAction("archive")}
        onToggleStar={() =>
          handleAction(viewingEmail.isStarred ? "unstar" : "star")
        }
      />
    );
  }

  // List View
  return (
    <div className="flex flex-col h-full">
      <EmailToolbar
        onMarkRead={() => handleAction("markRead")}
        onMarkUnread={() => handleAction("markUnread")}
        onDelete={() => handleAction("trash")}
        onArchive={() => handleAction("archive")}
        onSpam={() => handleAction("spam")}
        onStar={() => handleAction("star")}
      />

      {filteredEmails.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-10 w-10" />}
          title="Your inbox is empty"
          description="No messages to display. New emails will appear here."
        />
      ) : (
        <EmailList emails={filteredEmails} onEmailClick={handleEmailClick} />
      )}
    </div>
  );
}
