"use client";

import React from "react";
import { cn, formatFullDate, formatFileSize } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { useMailStore } from "@/store/useMailStore";
import {
  ArrowLeft,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  Paperclip,
  Download,
  Printer,
  Tag,
  AlertOctagon,
  FileText,
  Image,
  File,
} from "lucide-react";
import type { Email } from "@/types";

interface EmailViewProps {
  email: Email;
  onBack: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onToggleStar: () => void;
}

export function EmailView({
  email,
  onBack,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onArchive,
  onToggleStar,
}: EmailViewProps) {
  const getAttachmentIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) return <Image className="h-4 w-4" />;
    if (contentType.includes("pdf")) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-scalara-border">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onReply} title="Reply">
            <Reply className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onReplyAll}
            title="Reply All"
          >
            <ReplyAll className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onForward}
            title="Forward"
          >
            <Forward className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-scalara-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={onArchive}
            title="Archive"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleStar}
            title="Star"
          >
            <Star
              className={cn(
                "h-4 w-4",
                email.isStarred && "fill-amber-400 text-amber-400",
              )}
            />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>

          <Dropdown
            trigger={
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            items={[
              {
                label: "Print",
                icon: <Printer className="h-4 w-4" />,
                onClick: () => window.print(),
              },
              {
                label: "Add Label",
                icon: <Tag className="h-4 w-4" />,
                onClick: () => {},
              },
              {
                label: "Mark as Spam",
                icon: <AlertOctagon className="h-4 w-4" />,
                onClick: () => {},
                danger: true,
                divider: true,
              },
            ]}
          />
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {/* Subject */}
        <h2 className="text-xl font-semibold text-white mb-6">
          {email.subject || "(No Subject)"}
        </h2>

        {/* Sender Info */}
        <div className="flex items-start gap-4 mb-6">
          <Avatar name={email.fromName || email.fromAddress} size="lg" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-white">
                {email.fromName || email.fromAddress}
              </span>
              <span className="text-xs text-scalara-muted">
                &lt;{email.fromAddress}&gt;
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-scalara-muted">
              <span>to {email.toAddresses?.join(", ")}</span>
              {email.ccAddresses && email.ccAddresses.length > 0 && (
                <span>cc: {email.ccAddresses.join(", ")}</span>
              )}
            </div>
            <p className="text-xs text-scalara-muted mt-1">
              {formatFullDate(email.sentAt || email.receivedAt)}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="rounded-xl bg-scalara-surface border border-scalara-border p-6 mb-6">
          {email.bodyHtml ? (
            <div
              className="email-content"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className="text-sm text-scalara-muted-foreground whitespace-pre-wrap font-sans">
              {email.bodyText || "No content"}
            </pre>
          )}
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="h-4 w-4 text-scalara-muted" />
              <span className="text-sm font-medium text-white">
                {email.attachments.length} attachment
                {email.attachments.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-scalara-card border border-scalara-border hover:border-scalara-muted transition-colors cursor-pointer group"
                >
                  <div className="p-2 rounded-lg bg-scalara-bg text-scalara-muted">
                    {getAttachmentIcon(att.contentType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {att.filename}
                    </p>
                    <p className="text-xs text-scalara-muted">
                      {formatFileSize(att.size)}
                    </p>
                  </div>
                  <button className="p-1.5 rounded-lg text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors opacity-0 group-hover:opacity-100">
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Reply */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={onReply}
            icon={<Reply className="h-4 w-4" />}
          >
            Reply
          </Button>
          <Button
            variant="secondary"
            onClick={onForward}
            icon={<Forward className="h-4 w-4" />}
          >
            Forward
          </Button>
        </div>
      </div>
    </div>
  );
}
