"use client";

import React, { useState, useEffect } from "react";
import { useMailStore } from "@/store/useMailStore";
import { EmailList } from "@/components/email/EmailList";
import { EmailView } from "@/components/email/EmailView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { Archive } from "lucide-react";
import type { Email } from "@/types";

export default function ArchivePage() {
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
    setActiveFolder("archive");
    loadEmails();
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails?folder=archive&page=1&pageSize=50");
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
      const res = await fetch(`/api/emails/${email.uid}?folder=archive`);
      const data = await res.json();
      if (data.success) setViewingEmail({ ...email, ...data.data });
    } catch (e) {
      console.error(e);
    }
  };

  const handleBack = () => setViewingEmail(null);

  const handleMoveToInbox = async () => {
    const uid = viewingEmail?.uid;
    if (!uid) return;
    try {
      await fetch(`/api/emails/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          folder: "archive",
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
        onDelete={() => {}}
        onArchive={handleMoveToInbox}
        onToggleStar={() => {}}
      />
    );

  return (
    <div className="flex flex-col h-full">
      {filteredEmails.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-10 w-10" />}
          title="No archived messages"
          description="Archived emails will appear here."
        />
      ) : (
        <EmailList emails={filteredEmails} onEmailClick={handleEmailClick} />
      )}
    </div>
  );
}
