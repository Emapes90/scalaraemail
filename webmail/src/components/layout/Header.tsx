"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMailStore } from "@/store/useMailStore";
import { Avatar } from "@/components/ui/Avatar";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import {
  Search,
  RefreshCw,
  LogOut,
  User,
  Settings,
  HelpCircle,
  Bell,
  Moon,
} from "lucide-react";

export function Header() {
  const pathname = usePathname();
  const { searchQuery, setSearchQuery } = useMailStore();

  const getTitle = () => {
    const path = pathname.replace("/", "");
    const titles: Record<string, string> = {
      inbox: "Inbox",
      sent: "Sent",
      drafts: "Drafts",
      trash: "Trash",
      spam: "Spam",
      starred: "Starred",
      archive: "Archive",
      calendar: "Calendar",
      contacts: "Contacts",
      settings: "Settings",
    };
    return titles[path] || "Scalara";
  };

  return (
    <header className="h-16 flex items-center justify-between gap-4 px-6 border-b border-scalara-border bg-scalara-surface/50 backdrop-blur-sm">
      {/* Left — Title */}
      <h1 className="text-lg font-semibold text-white shrink-0">
        {getTitle()}
      </h1>

      {/* Center — Search */}
      <div className="flex-1 max-w-xl">
        <Input
          type="search"
          placeholder="Search emails, contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={<Search className="h-4 w-4" />}
          className="bg-scalara-bg/50 border-scalara-border/50 h-9"
        />
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-1">
        <button className="p-2 rounded-lg text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>

        <button className="p-2 rounded-lg text-scalara-muted hover:text-white hover:bg-scalara-hover transition-colors relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-white rounded-full" />
        </button>

        <div className="ml-2">
          <Dropdown
            trigger={
              <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-scalara-hover transition-colors">
                <Avatar name="User" size="sm" />
              </button>
            }
            items={[
              {
                label: "Profile",
                icon: <User className="h-4 w-4" />,
                onClick: () => {},
              },
              {
                label: "Settings",
                icon: <Settings className="h-4 w-4" />,
                onClick: () => {},
              },
              {
                label: "Help & Support",
                icon: <HelpCircle className="h-4 w-4" />,
                onClick: () => {},
              },
              {
                label: "Sign Out",
                icon: <LogOut className="h-4 w-4" />,
                onClick: () => {
                  window.location.href = "/login";
                },
                danger: true,
                divider: true,
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
