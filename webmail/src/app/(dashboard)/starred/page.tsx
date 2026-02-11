"use client";

import React, { useState, useEffect } from "react";
import { useMailStore } from "@/store/useMailStore";
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
    updateEmail,
    removeEmails,
    isLoading,
    setLoading,
    searchQuery,
    setComposing,
  } = useMailStore();
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);

  useEffect(() => {
    setActiveFolder("starred");
    loadEmails();
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails?folder=starred&page=1&pageSize=50");
      const data = await res.json();
      if (data.success)
        setEmails(data.data.emails.filter((e: any) => e.isStarred));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailClick = async (email: Email) => {
    setViewingEmail(email);
    try {
      const res = await fetch(`/api/emails/${email.uid}?folder=inbox`);
      const data = await res.json();
      if (data.success) setViewingEmail({ ...email, ...data.data });
    } catch (e) {
      console.error(e);
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
        body: JSON.stringify({ action, folder: "inbox" }),
      });
      if (action === "unstar") {
        removeEmails([String(uid)]);
        handleBack();
      }
      if (["trash", "archive"].includes(action)) {
        removeEmails([String(uid)]);
        handleBack();
      }
    } catch (e) {
      console.error(e);
    }
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
        onReply={() =>
          setComposing(true, {
            to: [viewingEmail.fromAddress],
            subject: `Re: ${viewingEmail.subject}`,
          })
        }
        onReplyAll={() => {}}
        onForward={() => {}}
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
        <EmailList emails={filteredEmails} onEmailClick={handleEmailClick} />
      )}
    </div>
  );
}
