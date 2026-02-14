"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useMailStore } from "@/store/useMailStore";
import { useToast } from "@/components/ui/Toast";
import { EmailList } from "@/components/email/EmailList";
import { EmailView } from "@/components/email/EmailView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { Star } from "lucide-react";
import type { Email } from "@/types";

export default function StarredPage() {
  const {
    emails,
    setEmails,
    setActiveFolder,
    removeEmails,
    updateEmail,
    isLoading,
    setLoading,
    searchQuery,
    setComposing,
  } = useMailStore();

  const toast = useToast();
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);

  const loadEmails = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(
          "/api/emails?folder=starred&page=1&pageSize=50",
        );
        const data = await res.json();
        if (data.success)
          setEmails(data.data.emails.filter((e: any) => e.isStarred));
      } catch {
        if (!silent) toast.error("Failed to load starred emails");
      } finally {
        setLoading(false);
      }
    },
    [setEmails, setLoading, toast],
  );

  useEffect(() => {
    setActiveFolder("starred");
    loadEmails();
  }, []);

  const handleEmailClick = async (email: Email) => {
    setViewingEmail(email);
    try {
      const res = await fetch(`/api/emails/${email.uid}?folder=starred`);
      const data = await res.json();
      if (data.success) setViewingEmail({ ...email, ...data.data });
    } catch {
      toast.error("Failed to load email");
    }
  };

  const handleBack = () => setViewingEmail(null);

  const handleAction = async (action: string) => {
    const uid = viewingEmail?.uid;
    if (!uid) return;
    try {
      await fetch(`/api/emails/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, folder: "starred" }),
      });
      if (action === "unstar") {
        removeEmails([String(uid)]);
        handleBack();
        toast.success("Unstarred");
      }
      if (["trash", "archive"].includes(action)) {
        removeEmails([String(uid)]);
        handleBack();
        toast.success(action === "trash" ? "Deleted" : "Archived");
      }
    } catch {
      toast.error(`Failed to ${action}`);
    }
  };

  const handleStarToggle = async (email: Email) => {
    updateEmail(email.id, { isStarred: false });
    try {
      await fetch(`/api/emails/${email.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unstar", folder: "starred" }),
      });
      removeEmails([email.id]);
      toast.success("Unstarred");
    } catch {
      updateEmail(email.id, { isStarred: true });
      toast.error("Failed to unstar");
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
    ? emails.filter((e) =>
        e.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : emails;

  if (isLoading) return <PageLoader />;

  if (viewingEmail)
    return (
      <EmailView
        email={viewingEmail}
        onBack={handleBack}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onForward={handleForward}
        onDelete={() => handleAction("trash")}
        onArchive={() => handleAction("archive")}
        onToggleStar={() => handleAction("unstar")}
      />
    );

  return (
    <div className="flex flex-col h-full">
      {filteredEmails.length === 0 ? (
        <EmptyState
          icon={<Star className="h-10 w-10" />}
          title="No starred messages"
          description="Star messages to find them easily later."
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
