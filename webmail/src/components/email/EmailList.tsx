"use client";

import React from "react";
import { cn, formatEmailDate, truncate } from "@/lib/utils";
import { useMailStore } from "@/store/useMailStore";
import { Avatar } from "@/components/ui/Avatar";
import { Star, Paperclip, Check } from "lucide-react";
import type { Email } from "@/types";

interface EmailListProps {
  emails: Email[];
  onEmailClick: (email: Email) => void;
}

export function EmailList({ emails, onEmailClick }: EmailListProps) {
  const { selectedEmails, toggleSelectEmail, activeEmail } = useMailStore();

  if (emails.length === 0) return null;

  return (
    <div className="divide-y divide-scalara-border/50">
      {emails.map((email) => {
        const isSelected = selectedEmails.has(email.id);
        const isActive = activeEmail?.id === email.id;

        return (
          <div
            key={email.id}
            onClick={() => onEmailClick(email)}
            className={cn(
              "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-100",
              "hover:bg-scalara-hover",
              isActive && "bg-white/[0.06]",
              !email.isRead && "bg-scalara-card/50",
            )}
          >
            {/* Checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSelectEmail(email.id);
              }}
              className={cn(
                "shrink-0 h-5 w-5 rounded border transition-all duration-150 flex items-center justify-center",
                isSelected
                  ? "bg-white border-white"
                  : "border-scalara-border group-hover:border-scalara-muted",
              )}
            >
              {isSelected && <Check className="h-3 w-3 text-black" />}
            </button>

            {/* Star */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Toggle star handled by parent
              }}
              className="shrink-0"
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  email.isStarred
                    ? "fill-amber-400 text-amber-400"
                    : "text-scalara-border group-hover:text-scalara-muted",
                )}
              />
            </button>

            {/* Avatar */}
            <Avatar name={email.fromName || email.fromAddress} size="sm" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span
                  className={cn(
                    "text-sm truncate",
                    !email.isRead
                      ? "font-semibold text-white"
                      : "font-medium text-scalara-muted-foreground",
                  )}
                >
                  {email.fromName || email.fromAddress}
                </span>
                <span className="text-xs text-scalara-muted shrink-0">
                  {formatEmailDate(email.receivedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    "text-sm truncate",
                    !email.isRead
                      ? "text-scalara-muted-foreground"
                      : "text-scalara-muted",
                  )}
                >
                  {email.subject || "(No Subject)"}
                </p>
              </div>
              {email.snippet && (
                <p className="text-xs text-scalara-muted truncate mt-0.5">
                  {truncate(email.snippet, 100)}
                </p>
              )}
            </div>

            {/* Indicators */}
            <div className="flex items-center gap-2 shrink-0">
              {email.hasAttachments && (
                <Paperclip className="h-3.5 w-3.5 text-scalara-muted" />
              )}
              {!email.isRead && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
