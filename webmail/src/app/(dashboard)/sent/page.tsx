"use client";

import React, { useState, useEffect } from "react";
import { useMailStore } from "@/store/useMailStore";
import { EmailList } from "@/components/email/EmailList";
import { EmailView } from "@/components/email/EmailView";
import { EmailToolbar } from "@/components/email/EmailToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { Send } from "lucide-react";
import type { Email } from "@/types";

export default function SentPage() {
  const {
    emails,
    setEmails,
    activeEmail,
    setActiveEmail,
    setActiveFolder,
    setComposing,
    updateEmail,
    removeEmails,
    isLoading,
    setLoading,
    searchQuery,
  } = useMailStore();
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);

  useEffect(() => {
    setActiveFolder("sent");
    loadEmails();
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails?folder=sent&page=1&pageSize=50");
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
    setActiveEmail(email);
    try {
      const res = await fetch(`/api/emails/${email.uid}?folder=sent`);
      const data = await res.json();
      if (data.success) setViewingEmail({ ...email, ...data.data });
    } catch (e) {
      console.error(e);
    }
  };

  const handleBack = () => {
    setViewingEmail(null);
    setActiveEmail(null);
  };

  const handleAction = async (action: string) => {
    const uid = viewingEmail?.uid;
    if (!uid) return;
    try {
      await fetch(`/api/emails/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, folder: "sent" }),
      });
      if (["trash", "archive", "spam"].includes(action)) {
        removeEmails([String(uid)]);
        handleBack();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredEmails = searchQuery
    ? emails.filter(
        (e) =>
          e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : emails;

  if (isLoading) return <PageLoader />;
  if (viewingEmail)
    return (
      <EmailView
        email={viewingEmail}
        onBack={handleBack}
        onReply={() => {}}
        onReplyAll={() => {}}
        onForward={() =>
          setComposing(true, {
            subject: `Fwd: ${viewingEmail.subject}`,
            body: viewingEmail.bodyText || "",
          })
        }
        onDelete={() => handleAction("trash")}
        onArchive={() => handleAction("archive")}
        onToggleStar={() =>
          handleAction(viewingEmail.isStarred ? "unstar" : "star")
        }
      />
    );

  return (
    <div className="flex flex-col h-full">
      <EmailToolbar
        onMarkRead={() => {}}
        onMarkUnread={() => {}}
        onDelete={() => handleAction("trash")}
        onArchive={() => handleAction("archive")}
        onSpam={() => handleAction("spam")}
        onStar={() => handleAction("star")}
      />
      {filteredEmails.length === 0 ? (
        <EmptyState
          icon={<Send className="h-10 w-10" />}
          title="No sent messages"
          description="Messages you send will appear here."
        />
      ) : (
        <EmailList emails={filteredEmails} onEmailClick={handleEmailClick} />
      )}
    </div>
  );
}
