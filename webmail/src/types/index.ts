// ============================================
// Scalara Webmail — Type Definitions
// ============================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  signature: string | null;
  timezone: string;
  language: string;
  theme: string;
  emailsPerPage: number;
  notifications: boolean;
  autoRefresh: number;
}

export interface Email {
  id: string;
  messageId: string;
  uid?: number;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  replyTo?: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  priority: number;
  size?: number;
  folderId: string;
  labels?: Label[];
  attachments?: Attachment[];
  sentAt?: string;
  receivedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
}

export interface Folder {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  type: FolderType;
  sortOrder: number;
  unreadCount?: number;
  totalCount?: number;
}

export type FolderType =
  | "INBOX"
  | "SENT"
  | "DRAFTS"
  | "TRASH"
  | "SPAM"
  | "STARRED"
  | "ARCHIVE"
  | "CUSTOM";

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  emails: ContactEmail[];
  phones: ContactPhone[];
  company: string | null;
  jobTitle: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  avatar: string | null;
  birthday: string | null;
  isFavorite: boolean;
  groups?: ContactGroup[];
  createdAt: string;
  updatedAt: string;
}

export interface ContactEmail {
  id: string;
  email: string;
  type: string;
  isPrimary: boolean;
}

export interface ContactPhone {
  id: string;
  phone: string;
  type: string;
  isPrimary: boolean;
}

export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  memberCount?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: string | null;
  recurrence: string | null;
  calendarId: string;
  calendar?: Calendar;
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isVisible: boolean;
}

export interface EmailFilter {
  id: string;
  name: string;
  isActive: boolean;
  conditions: FilterCondition;
  action: string;
  actionValue: string | null;
}

export interface FilterCondition {
  from?: string;
  to?: string;
  subject?: string;
  contains?: string;
  hasAttachment?: boolean;
}

export interface ComposeData {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: File[];
  inReplyTo?: string;
  isHtml: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
