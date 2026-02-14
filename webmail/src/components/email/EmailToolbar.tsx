"use client";

import React from "react";
import { useMailStore } from "@/store/useMailStore";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  Check,
  Trash2,
  Archive,
  MailOpen,
  Mail,
  Tag,
  AlertOctagon,
  Star,
  MoreHorizontal,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

interface EmailToolbarProps {
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onSpam: () => void;
  onStar: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function EmailToolbar({
  onMarkRead,
  onMarkUnread,
  onDelete,
  onArchive,
  onSpam,
  onStar,
  onRefresh,
  refreshing,
}: EmailToolbarProps) {
  const { emails, selectedEmails, selectAllEmails, clearSelection } =
    useMailStore();
  const hasSelection = selectedEmails.size > 0;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-scalara-border bg-scalara-surface/50">
      {/* Select All */}
      <button
        onClick={() => {
          if (selectedEmails.size === emails.length) {
            clearSelection();
          } else {
            selectAllEmails();
          }
        }}
        className="shrink-0 h-5 w-5 rounded border border-scalara-border hover:border-scalara-muted transition-colors flex items-center justify-center"
      >
        {selectedEmails.size === emails.length && emails.length > 0 && (
          <Check className="h-3 w-3 text-white" />
        )}
      </button>

      {hasSelection ? (
        <>
          <span className="text-xs text-scalara-muted">
            {selectedEmails.size} selected
          </span>

          <div className="flex items-center gap-0.5 ml-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkRead}
              title="Mark as Read"
            >
              <MailOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkUnread}
              title="Mark as Unread"
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onStar} title="Star">
              <Star className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onArchive}
              title="Archive"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>

            <Dropdown
              trigger={
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                {
                  label: "Add Label",
                  icon: <Tag className="h-4 w-4" />,
                  onClick: () => {},
                },
                {
                  label: "Report Spam",
                  icon: <AlertOctagon className="h-4 w-4" />,
                  onClick: onSpam,
                  danger: true,
                  divider: true,
                },
              ]}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-scalara-muted">
            {emails.length} conversations
          </span>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              title="Refresh"
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
