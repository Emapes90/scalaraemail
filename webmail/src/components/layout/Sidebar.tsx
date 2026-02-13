"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMailStore } from "@/store/useMailStore";
import { CountBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  AlertOctagon,
  Star,
  Archive,
  Calendar,
  Users,
  Settings,
  PenSquare,
  ChevronLeft,
  ChevronRight,
  Tag,
  Mail,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  slug?: string;
}

const mainNav: NavItem[] = [
  {
    label: "Inbox",
    href: "/inbox",
    icon: <Inbox className="h-[18px] w-[18px]" />,
    slug: "inbox",
  },
  {
    label: "Starred",
    href: "/starred",
    icon: <Star className="h-[18px] w-[18px]" />,
    slug: "starred",
  },
  {
    label: "Sent",
    href: "/sent",
    icon: <Send className="h-[18px] w-[18px]" />,
    slug: "sent",
  },
  {
    label: "Drafts",
    href: "/drafts",
    icon: <FileEdit className="h-[18px] w-[18px]" />,
    slug: "drafts",
  },
  {
    label: "Archive",
    href: "/archive",
    icon: <Archive className="h-[18px] w-[18px]" />,
    slug: "archive",
  },
  {
    label: "Spam",
    href: "/spam",
    icon: <AlertOctagon className="h-[18px] w-[18px]" />,
    slug: "spam",
  },
  {
    label: "Trash",
    href: "/trash",
    icon: <Trash2 className="h-[18px] w-[18px]" />,
    slug: "trash",
  },
];

const toolsNav: NavItem[] = [
  {
    label: "Calendar",
    href: "/calendar",
    icon: <Calendar className="h-[18px] w-[18px]" />,
  },
  {
    label: "Contacts",
    href: "/contacts",
    icon: <Users className="h-[18px] w-[18px]" />,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, setComposing, folders } =
    useMailStore();

  const getUnreadCount = (slug: string) => {
    const folder = folders.find((f) => f.slug === slug);
    return folder?.unreadCount || 0;
  };

  return (
    <aside
      className={cn(
        "h-screen flex flex-col bg-scalara-surface border-r border-scalara-border transition-all duration-200",
        sidebarCollapsed ? "w-[68px]" : "w-[260px]",
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-scalara-border">
        {!sidebarCollapsed && (
          <Link href="/inbox" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center">
              <Mail className="h-4 w-4 text-black" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Scalara
            </span>
          </Link>
        )}
        {sidebarCollapsed && (
          <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center mx-auto">
            <Mail className="h-4 w-4 text-black" />
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            "p-1.5 rounded-lg text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors",
            sidebarCollapsed && "hidden",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Compose Button */}
      <div className="px-3 pt-4 pb-2">
        {sidebarCollapsed ? (
          <Button
            size="icon"
            onClick={() => setComposing(true)}
            className="w-full"
          >
            <PenSquare className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => setComposing(true)}
            className="w-full justify-center gap-2"
            icon={<PenSquare className="h-4 w-4" />}
          >
            Compose
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
        {/* Mail Folders */}
        <div className="space-y-0.5">
          {!sidebarCollapsed && (
            <p className="px-3 py-1.5 text-2xs font-semibold text-scalara-muted uppercase tracking-wider">
              Mail
            </p>
          )}
          {mainNav.map((item) => {
            const isActive = pathname === item.href;
            const unread = item.slug ? getUnreadCount(item.slug) : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
                  sidebarCollapsed && "justify-center px-2",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {unread > 0 && <CountBadge count={unread} />}
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Divider */}
        <div className="my-3 border-t border-scalara-border" />

        {/* Tools */}
        <div className="space-y-0.5">
          {!sidebarCollapsed && (
            <p className="px-3 py-1.5 text-2xs font-semibold text-scalara-muted uppercase tracking-wider">
              Tools
            </p>
          )}
          {toolsNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
                  sidebarCollapsed && "justify-center px-2",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!sidebarCollapsed && (
                  <span className="flex-1">{item.label}</span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Divider */}
        <div className="my-3 border-t border-scalara-border" />

        {/* Labels */}
        {!sidebarCollapsed && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-3 py-1.5">
              <p className="text-2xs font-semibold text-scalara-muted uppercase tracking-wider">
                Labels
              </p>
              <button className="p-0.5 rounded text-scalara-muted hover:text-white transition-colors">
                <Tag className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-scalara-border p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-white/10 text-white"
              : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
            sidebarCollapsed && "justify-center px-2",
          )}
          title={sidebarCollapsed ? "Settings" : undefined}
        >
          <Settings className="h-[18px] w-[18px]" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>

        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors mt-0.5"
          >
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </aside>
  );
}
