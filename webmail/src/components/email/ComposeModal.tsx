"use client";

import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { useMailStore } from "@/store/useMailStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  X,
  Send,
  Paperclip,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
  Minimize2,
  Maximize2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function ComposeModal() {
  const { isComposing, composeData, setComposing } = useMailStore();
  const [to, setTo] = useState(composeData?.to?.join(", ") || "");
  const [cc, setCc] = useState(composeData?.cc?.join(", ") || "");
  const [bcc, setBcc] = useState(composeData?.bcc?.join(", ") || "");
  const [subject, setSubject] = useState(composeData?.subject || "");
  const [body, setBody] = useState(composeData?.body || "");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isComposing) return null;

  const handleSend = async () => {
    setIsSending(true);
    try {
      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
          cc: cc
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
          bcc: bcc
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
          subject,
          body,
        }),
      });

      if (response.ok) {
        setComposing(false);
        // Reset fields
        setTo("");
        setCc("");
        setBcc("");
        setSubject("");
        setBody("");
        setAttachments([]);
      }
    } catch (error) {
      console.error("Failed to send email:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        "fixed z-50 bg-scalara-surface border border-scalara-border rounded-t-xl shadow-2xl flex flex-col animate-slide-up",
        isFullscreen
          ? "inset-4 rounded-xl"
          : "bottom-0 right-6 w-[580px] h-[520px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-scalara-border bg-scalara-card rounded-t-xl">
        <h3 className="text-sm font-semibold text-white">New Message</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded text-scalara-muted hover:text-white transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => setComposing(false)}
            className="p-1 rounded text-scalara-muted hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-2 space-y-0 border-b border-scalara-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-scalara-muted w-10 shrink-0">To</span>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white py-2 focus:outline-none placeholder:text-scalara-muted"
            placeholder="recipient@email.com"
          />
          <div className="flex items-center gap-1 text-xs text-scalara-muted">
            <button
              onClick={() => setShowCc(!showCc)}
              className="hover:text-white transition-colors"
            >
              Cc
            </button>
            <button
              onClick={() => setShowBcc(!showBcc)}
              className="hover:text-white transition-colors"
            >
              Bcc
            </button>
          </div>
        </div>

        {showCc && (
          <div className="flex items-center gap-2 border-t border-scalara-border/50">
            <span className="text-xs text-scalara-muted w-10 shrink-0">Cc</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white py-2 focus:outline-none placeholder:text-scalara-muted"
              placeholder="cc@email.com"
            />
          </div>
        )}

        {showBcc && (
          <div className="flex items-center gap-2 border-t border-scalara-border/50">
            <span className="text-xs text-scalara-muted w-10 shrink-0">
              Bcc
            </span>
            <input
              type="text"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white py-2 focus:outline-none placeholder:text-scalara-muted"
              placeholder="bcc@email.com"
            />
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-scalara-border/50">
          <span className="text-xs text-scalara-muted w-10 shrink-0">Sub</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white py-2 focus:outline-none placeholder:text-scalara-muted"
            placeholder="Subject"
          />
        </div>
      </div>

      {/* Body Editor */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full h-full p-4 bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-scalara-muted"
          placeholder="Write your message..."
        />
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-scalara-border flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-2 py-1 rounded-lg bg-scalara-card border border-scalara-border text-xs"
            >
              <Paperclip className="h-3 w-3 text-scalara-muted" />
              <span className="text-white truncate max-w-[120px]">
                {file.name}
              </span>
              <button
                onClick={() => removeAttachment(index)}
                className="text-scalara-muted hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-scalara-border">
        <div className="flex items-center gap-0.5">
          {/* Formatting buttons */}
          {[
            { icon: Bold, label: "Bold" },
            { icon: Italic, label: "Italic" },
            { icon: Underline, label: "Underline" },
            { icon: List, label: "Bullet List" },
            { icon: ListOrdered, label: "Numbered List" },
            { icon: Link, label: "Insert Link" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              className="p-1.5 rounded text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}

          <div className="w-px h-5 bg-scalara-border mx-1" />

          <button
            onClick={handleAttachFile}
            title="Attach File"
            className="p-1.5 rounded text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setComposing(false)}
            icon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            loading={isSending}
            icon={<Send className="h-3.5 w-3.5" />}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
