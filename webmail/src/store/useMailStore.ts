import { create } from "zustand";
import type {
  Email,
  Folder,
  Contact,
  CalendarEvent,
  Calendar,
  Label,
  ComposeData,
} from "@/types";

interface MailState {
  // Folders
  folders: Folder[];
  activeFolder: string;
  setFolders: (folders: Folder[]) => void;
  setActiveFolder: (slug: string) => void;

  // Emails
  emails: Email[];
  selectedEmails: Set<string>;
  activeEmail: Email | null;
  setEmails: (emails: Email[]) => void;
  setActiveEmail: (email: Email | null) => void;
  toggleSelectEmail: (id: string) => void;
  selectAllEmails: () => void;
  clearSelection: () => void;
  updateEmail: (id: string, data: Partial<Email>) => void;
  removeEmails: (ids: string[]) => void;

  // Compose
  isComposing: boolean;
  composeData: ComposeData | null;
  setComposing: (open: boolean, data?: Partial<ComposeData>) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearching: boolean;
  setIsSearching: (val: boolean) => void;

  // Contacts
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;

  // Calendar
  events: CalendarEvent[];
  calendars: Calendar[];
  setEvents: (events: CalendarEvent[]) => void;
  setCalendars: (calendars: Calendar[]) => void;

  // Labels
  labels: Label[];
  setLabels: (labels: Label[]) => void;

  // UI
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isLoading: boolean;
  setLoading: (val: boolean) => void;
}

export const useMailStore = create<MailState>((set, get) => ({
  // Folders
  folders: [],
  activeFolder: "inbox",
  setFolders: (folders) => set({ folders }),
  setActiveFolder: (slug) =>
    set({ activeFolder: slug, selectedEmails: new Set(), activeEmail: null }),

  // Emails
  emails: [],
  selectedEmails: new Set(),
  activeEmail: null,
  setEmails: (emails) => set({ emails }),
  setActiveEmail: (email) => set({ activeEmail: email }),
  toggleSelectEmail: (id) => {
    const selected = new Set(get().selectedEmails);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selectedEmails: selected });
  },
  selectAllEmails: () => {
    const ids = get().emails.map((e) => e.id);
    set({ selectedEmails: new Set(ids) });
  },
  clearSelection: () => set({ selectedEmails: new Set() }),
  updateEmail: (id, data) => {
    set({
      emails: get().emails.map((e) => (e.id === id ? { ...e, ...data } : e)),
      activeEmail:
        get().activeEmail?.id === id
          ? { ...get().activeEmail!, ...data }
          : get().activeEmail,
    });
  },
  removeEmails: (ids) => {
    const idSet = new Set(ids);
    set({
      emails: get().emails.filter((e) => !idSet.has(e.id)),
      selectedEmails: new Set(),
      activeEmail: idSet.has(get().activeEmail?.id || "")
        ? null
        : get().activeEmail,
    });
  },

  // Compose
  isComposing: false,
  composeData: null,
  setComposing: (open, data) =>
    set({
      isComposing: open,
      composeData: open
        ? {
            to: [],
            cc: [],
            bcc: [],
            subject: "",
            body: "",
            attachments: [],
            isHtml: false,
            ...data,
          }
        : null,
    }),

  // Search
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  isSearching: false,
  setIsSearching: (val) => set({ isSearching: val }),

  // Contacts
  contacts: [],
  setContacts: (contacts) => set({ contacts }),

  // Calendar
  events: [],
  calendars: [],
  setEvents: (events) => set({ events }),
  setCalendars: (calendars) => set({ calendars }),

  // Labels
  labels: [],
  setLabels: (labels) => set({ labels }),

  // UI
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  isLoading: false,
  setLoading: (val) => set({ isLoading: val }),
}));
