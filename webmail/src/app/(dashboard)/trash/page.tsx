"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useMailStore } from "@/store/useMailStore";
import { useToast } from "@/components/ui/Toast";
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
    selectedEmails,
    clearSelection,
    isLoading,
    setLoading,
    searchQuery,
    setComposing,
  } = useMailStore();

  const toast = useToast();
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadEmails = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch("/api/emails?folder=trash&page=1&pageSize=50");
        const data = await res.json();
        if (data.success) setEmails(data.data.emails);
      } catch {
        if (!silent) toast.error("Failed to load trash");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setEmails, setLoading, toast],
  );

  useEffect(() => {
    setActiveFolder("trash");
    loadEmails();
  }, []);

  const handleEmailClick = async (email: Email) => {
    setViewingEmail(email);
    try {
      const res = await fetch(`/api/emails/${email.uid}?folder=trash`);
      const data = await res.json();
      if (data.success) setViewingEmail({ ...email, ...data.data });
    } catch {
      toast.error("Failed to load email");
    }
  };

  const handleBack = () => setViewingEmail(null);

  const handleDelete = async () => {
    const targets = viewingEmail
      ? [String(viewingEmail.uid)]
      : Array.from(selectedEmails);

    if (targets.length === 0) {
      toast.warning("No emails selected");
      return;
    }

    try {
      await Promise.all(
        targets.map((uid) =>
          fetch(`/api/emails/${uid}?folder=trash`, { method: "DELETE" }),
        ),
      );
      removeEmails(targets);
      clearSelection();
      if (viewingEmail) handleBack();
      toast.success(
        `Permanently deleted ${targets.length > 1 ? targets.length + " emails" : "email"}`,
      );
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleRestore = async () => {
    const targets = viewingEmail
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
            body: JSON.stringify({
              action: "move",
              folder: "trash",
              targetFolder: "inbox",
            }),
          }),
        ),
      );
      removeEmails(targets);
      clearSelection();
      if (viewingEmail) handleBack();
      toast.success(
        `Restored ${targets.length > 1 ? targets.length + " emails" : "email"} to inbox`,
      );
    } catch {
      toast.error("Failed to restore");
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
        onRefresh={() => loadEmails(true)}
        refreshing={refreshing}
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
