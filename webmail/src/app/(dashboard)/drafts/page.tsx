"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useMailStore } from "@/store/useMailStore";
import { useToast } from "@/components/ui/Toast";
import { EmailList } from "@/components/email/EmailList";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Loader";
import { FileEdit } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Email } from "@/types";

export default function DraftsPage() {
  const {
    emails,
    setEmails,
    setActiveFolder,
    setComposing,
    isLoading,
    setLoading,
    searchQuery,
  } = useMailStore();

  const toast = useToast();

  const loadEmails = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/emails?folder=drafts&page=1&pageSize=50");
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) setEmails(data.data.emails);
      } catch {
        if (!silent) toast.error("Failed to load drafts");
      } finally {
        setLoading(false);
      }
    },
    [setEmails, setLoading, toast],
  );

  useEffect(() => {
    setActiveFolder("drafts");
    loadEmails();
  }, []);

  const handleDraftClick = (email: Email) => {
    setComposing(true, {
      to: email.toAddresses || [],
      cc: email.ccAddresses || [],
      bcc: email.bccAddresses || [],
      subject: email.subject || "",
      body: email.bodyText || "",
    });
    toast.info("Draft loaded");
  };

  const filteredEmails = searchQuery
    ? emails.filter((e) =>
        e.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : emails;

  if (isLoading) return <PageLoader />;

  return (
    <div className="flex flex-col h-full">
      {filteredEmails.length === 0 ? (
        <EmptyState
          icon={<FileEdit className="h-10 w-10" />}
          title="No drafts"
          description="Saved drafts will appear here."
          action={
            <Button onClick={() => setComposing(true)}>Compose New</Button>
          }
        />
      ) : (
        <EmailList emails={filteredEmails} onEmailClick={handleDraftClick} />
      )}
    </div>
  );
}
