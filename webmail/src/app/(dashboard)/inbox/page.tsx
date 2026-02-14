"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useMailStore } from "@/store/useMailStore";
import { useToast } from "@/components/ui/Toast";
import { EmailList } from "@/components/email/EmailList";
import { EmailView } from "@/components/email/EmailView";
import { EmailToolbar } from "@/components/email/EmailToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { Inbox as InboxIcon, RefreshCw } from "lucide-react";
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
    selectedEmails,
    clearSelection,
    isLoading,
    setLoading,
  } = useMailStore();

  const toast = useToast();
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadEmails = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch("/api/emails?folder=inbox&page=1&pageSize=50");
        const data = await res.json();
        if (data.success) setEmails(data.data.emails);
      } catch (error) {
        if (!silent) toast.error("Failed to load emails");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setEmails, setLoading, toast],
  );

  useEffect(() => {
    setActiveFolder("inbox");
    loadEmails();
  }, []);

  // Listen for refresh events (e.g. after sending)
  useEffect(() => {
    const handler = () => loadEmails(true);
    window.addEventListener("scalara:refresh-emails", handler);
    return () => window.removeEventListener("scalara:refresh-emails", handler);
  }, [loadEmails]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => loadEmails(true), 60000);
    return () => clearInterval(interval);
  }, [loadEmails]);

  const handleEmailClick = async (email: Email) => {
    setViewingEmail(email);
    setActiveEmail(email);
    try {
      const res = await fetch(`/api/emails/${email.uid}?folder=inbox`);
      const data = await res.json();
      if (data.success) {
        const fullEmail = { ...email, ...data.data };
        setViewingEmail(fullEmail);
        updateEmail(email.id, { isRead: true });
      }
    } catch {
      toast.error("Failed to load email");
    }
  };

  const handleBack = () => {
    setViewingEmail(null);
    setActiveEmail(null);
  };

  const handleAction = async (action: string, emailId?: string) => {
    const targets = emailId
      ? [emailId]
      : viewingEmail
        ? [String(viewingEmail.uid)]
        : Array.from(selectedEmails);

    if (targets.length === 0) {
      toast.warning("No emails selected");
      return;
    }

    try {
      await Promise.all(
        targets.map((uid) =>
          fetch(`/api/emails/${uid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, folder: "inbox" }),
          }),
        ),
      );

      if (["trash", "archive", "spam"].includes(action)) {
        removeEmails(targets);
        if (viewingEmail) handleBack();
        clearSelection();
        const label =
          action === "trash"
            ? "Deleted"
            : action === "archive"
              ? "Archived"
              : "Marked as spam";
        toast.success(
          `${label} ${targets.length > 1 ? targets.length + " emails" : "email"}`,
        );
      }

      if (action === "star") {
        targets.forEach((uid) => updateEmail(uid, { isStarred: true }));
        toast.success("Starred");
      }
      if (action === "unstar") {
        targets.forEach((uid) => updateEmail(uid, { isStarred: false }));
        toast.success("Unstarred");
      }
      if (action === "markRead") {
        targets.forEach((uid) => updateEmail(uid, { isRead: true }));
        toast.success("Marked as read");
      }
      if (action === "markUnread") {
        targets.forEach((uid) => updateEmail(uid, { isRead: false }));
        toast.success("Marked as unread");
      }
    } catch {
      toast.error(`Failed to ${action}`);
    }
  };

  const handleStarToggle = async (email: Email) => {
    const action = email.isStarred ? "unstar" : "star";
    updateEmail(email.id, { isStarred: !email.isStarred });
    try {
      await fetch(`/api/emails/${email.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, folder: "inbox" }),
      });
    } catch {
      updateEmail(email.id, { isStarred: email.isStarred });
      toast.error("Failed to update star");
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

  const filteredEmails = searchQuery
    ? emails.filter(
        (e) =>
          e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.fromName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.snippet?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : emails;

  if (isLoading) return <PageLoader />;

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

  return (
    <div className="flex flex-col h-full">
      <EmailToolbar
        onRefresh={() => loadEmails(true)}
        refreshing={refreshing}
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
        <EmailList
          emails={filteredEmails}
          onEmailClick={handleEmailClick}
          onStarToggle={handleStarToggle}
        />
      )}
    </div>
  );
}
