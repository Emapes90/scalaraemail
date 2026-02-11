"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  Search,
  Plus,
  Mail,
  Phone,
  Building,
  Globe,
  MapPin,
  Star,
  Edit3,
  Trash2,
  MoreHorizontal,
  Users,
  Heart,
  X,
  Briefcase,
  Calendar,
} from "lucide-react";
import type { Contact, ContactGroup } from "@/types";

interface ContactListProps {
  contacts: Contact[];
  groups: ContactGroup[];
  onCreateContact: (contact: any) => void;
  onUpdateContact: (contact: any) => void;
  onDeleteContact: (id: string) => void;
}

export function ContactList({
  contacts,
  groups,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
}: ContactListProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    phone: "",
    company: "",
    jobTitle: "",
    website: "",
    address: "",
    notes: "",
  });

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.emails.some((e) =>
        e.email.toLowerCase().includes(searchQuery.toLowerCase()),
      ) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesGroup =
      !activeGroup || c.groups?.some((g) => g.id === activeGroup);

    return matchesSearch && matchesGroup;
  });

  // Group contacts alphabetically
  const groupedContacts: Record<string, Contact[]> = {};
  filteredContacts.forEach((contact) => {
    const letter = contact.displayName[0].toUpperCase();
    if (!groupedContacts[letter]) groupedContacts[letter] = [];
    groupedContacts[letter].push(contact);
  });

  const handleCreate = () => {
    const displayName =
      [contactForm.firstName, contactForm.lastName].filter(Boolean).join(" ") ||
      contactForm.email;
    onCreateContact({
      firstName: contactForm.firstName || null,
      lastName: contactForm.lastName || null,
      displayName,
      emails: contactForm.email
        ? [{ email: contactForm.email, type: "personal", isPrimary: true }]
        : [],
      phones: contactForm.phone
        ? [{ phone: contactForm.phone, type: "mobile", isPrimary: true }]
        : [],
      company: contactForm.company || null,
      jobTitle: contactForm.jobTitle || null,
      website: contactForm.website || null,
      address: contactForm.address || null,
      notes: contactForm.notes || null,
    });
    setShowCreateModal(false);
    setContactForm({
      firstName: "",
      lastName: "",
      displayName: "",
      email: "",
      phone: "",
      company: "",
      jobTitle: "",
      website: "",
      address: "",
      notes: "",
    });
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r border-scalara-border flex flex-col">
        {/* Search & Actions */}
        <div className="p-4 space-y-3 border-b border-scalara-border">
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="h-4 w-4" />}
            className="h-9"
          />
          <Button
            onClick={() => setShowCreateModal(true)}
            className="w-full"
            icon={<Plus className="h-4 w-4" />}
          >
            New Contact
          </Button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          <button
            onClick={() => setActiveGroup(null)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              !activeGroup
                ? "bg-white/10 text-white"
                : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
            )}
          >
            <Users className="h-4 w-4" />
            <span className="flex-1 text-left">All Contacts</span>
            <span className="text-xs text-scalara-muted">
              {contacts.length}
            </span>
          </button>
          <button
            onClick={() => setActiveGroup("favorites")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              activeGroup === "favorites"
                ? "bg-white/10 text-white"
                : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
            )}
          >
            <Heart className="h-4 w-4" />
            <span className="flex-1 text-left">Favorites</span>
            <span className="text-xs text-scalara-muted">
              {contacts.filter((c) => c.isFavorite).length}
            </span>
          </button>

          {groups.length > 0 && (
            <>
              <div className="my-2 border-t border-scalara-border" />
              <p className="px-3 py-1.5 text-2xs font-semibold text-scalara-muted uppercase tracking-wider">
                Groups
              </p>
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActiveGroup(group.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    activeGroup === group.id
                      ? "bg-white/10 text-white"
                      : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
                  )}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="flex-1 text-left">{group.name}</span>
                  <span className="text-xs text-scalara-muted">
                    {group.memberCount || 0}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 flex">
        {/* List */}
        <div
          className={cn(
            "overflow-y-auto custom-scrollbar border-r border-scalara-border",
            selectedContact ? "w-80" : "flex-1",
          )}
        >
          {filteredContacts.length === 0 ? (
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No contacts"
              description="Add contacts to get started."
              action={
                <Button
                  onClick={() => setShowCreateModal(true)}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Add Contact
                </Button>
              }
            />
          ) : (
            Object.keys(groupedContacts)
              .sort()
              .map((letter) => (
                <div key={letter}>
                  <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold text-scalara-muted bg-scalara-bg/90 backdrop-blur-sm border-b border-scalara-border/50">
                    {letter}
                  </div>
                  {groupedContacts[letter].map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                        "hover:bg-scalara-hover border-b border-scalara-border/30",
                        selectedContact?.id === contact.id && "bg-white/[0.06]",
                      )}
                    >
                      <Avatar
                        name={contact.displayName}
                        src={contact.avatar}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {contact.displayName}
                        </p>
                        {contact.emails[0] && (
                          <p className="text-xs text-scalara-muted truncate">
                            {contact.emails[0].email}
                          </p>
                        )}
                      </div>
                      {contact.isFavorite && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>

        {/* Contact Detail */}
        {selectedContact && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 animate-fade-in">
            <div className="max-w-md mx-auto">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <Avatar
                    name={selectedContact.displayName}
                    src={selectedContact.avatar}
                    size="xl"
                  />
                  <div>
                    <h2 className="text-xl font-semibold text-white">
                      {selectedContact.displayName}
                    </h2>
                    {selectedContact.jobTitle && (
                      <p className="text-sm text-scalara-muted">
                        {selectedContact.jobTitle}
                      </p>
                    )}
                    {selectedContact.company && (
                      <p className="text-sm text-scalara-muted">
                        {selectedContact.company}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Dropdown
                    trigger={
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                    items={[
                      {
                        label: "Send Email",
                        icon: <Mail className="h-4 w-4" />,
                        onClick: () => {},
                      },
                      {
                        label: "Delete Contact",
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => {
                          onDeleteContact(selectedContact.id);
                          setSelectedContact(null);
                        },
                        danger: true,
                        divider: true,
                      },
                    ]}
                  />
                </div>
              </div>

              {/* Details */}
              <div className="space-y-4">
                {/* Emails */}
                {selectedContact.emails.length > 0 && (
                  <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                    <h3 className="text-xs font-semibold text-scalara-muted uppercase tracking-wider mb-3">
                      Email
                    </h3>
                    <div className="space-y-2">
                      {selectedContact.emails.map((e) => (
                        <div key={e.id} className="flex items-center gap-3">
                          <Mail className="h-4 w-4 text-scalara-muted shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {e.email}
                            </p>
                            <p className="text-xs text-scalara-muted capitalize">
                              {e.type}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Phones */}
                {selectedContact.phones.length > 0 && (
                  <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                    <h3 className="text-xs font-semibold text-scalara-muted uppercase tracking-wider mb-3">
                      Phone
                    </h3>
                    <div className="space-y-2">
                      {selectedContact.phones.map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <Phone className="h-4 w-4 text-scalara-muted shrink-0" />
                          <div>
                            <p className="text-sm text-white">{p.phone}</p>
                            <p className="text-xs text-scalara-muted capitalize">
                              {p.type}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other info */}
                {(selectedContact.company ||
                  selectedContact.website ||
                  selectedContact.address ||
                  selectedContact.birthday) && (
                  <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border space-y-2">
                    <h3 className="text-xs font-semibold text-scalara-muted uppercase tracking-wider mb-3">
                      Details
                    </h3>
                    {selectedContact.company && (
                      <div className="flex items-center gap-3">
                        <Building className="h-4 w-4 text-scalara-muted" />
                        <span className="text-sm text-white">
                          {selectedContact.company}
                        </span>
                      </div>
                    )}
                    {selectedContact.jobTitle && (
                      <div className="flex items-center gap-3">
                        <Briefcase className="h-4 w-4 text-scalara-muted" />
                        <span className="text-sm text-white">
                          {selectedContact.jobTitle}
                        </span>
                      </div>
                    )}
                    {selectedContact.website && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-scalara-muted" />
                        <a
                          href={selectedContact.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:underline"
                        >
                          {selectedContact.website}
                        </a>
                      </div>
                    )}
                    {selectedContact.address && (
                      <div className="flex items-center gap-3">
                        <MapPin className="h-4 w-4 text-scalara-muted" />
                        <span className="text-sm text-white">
                          {selectedContact.address}
                        </span>
                      </div>
                    )}
                    {selectedContact.birthday && (
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-scalara-muted" />
                        <span className="text-sm text-white">
                          {new Date(
                            selectedContact.birthday,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {selectedContact.notes && (
                  <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                    <h3 className="text-xs font-semibold text-scalara-muted uppercase tracking-wider mb-2">
                      Notes
                    </h3>
                    <p className="text-sm text-scalara-muted-foreground whitespace-pre-wrap">
                      {selectedContact.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Contact Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New Contact"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              placeholder="First name"
              value={contactForm.firstName}
              onChange={(e) =>
                setContactForm({ ...contactForm, firstName: e.target.value })
              }
              autoFocus
            />
            <Input
              label="Last Name"
              placeholder="Last name"
              value={contactForm.lastName}
              onChange={(e) =>
                setContactForm({ ...contactForm, lastName: e.target.value })
              }
            />
          </div>
          <Input
            label="Email"
            type="email"
            placeholder="email@example.com"
            value={contactForm.email}
            onChange={(e) =>
              setContactForm({ ...contactForm, email: e.target.value })
            }
            icon={<Mail className="h-4 w-4" />}
          />
          <Input
            label="Phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={contactForm.phone}
            onChange={(e) =>
              setContactForm({ ...contactForm, phone: e.target.value })
            }
            icon={<Phone className="h-4 w-4" />}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Company"
              placeholder="Company"
              value={contactForm.company}
              onChange={(e) =>
                setContactForm({ ...contactForm, company: e.target.value })
              }
              icon={<Building className="h-4 w-4" />}
            />
            <Input
              label="Job Title"
              placeholder="Job title"
              value={contactForm.jobTitle}
              onChange={(e) =>
                setContactForm({ ...contactForm, jobTitle: e.target.value })
              }
            />
          </div>
          <Input
            label="Website"
            placeholder="https://..."
            value={contactForm.website}
            onChange={(e) =>
              setContactForm({ ...contactForm, website: e.target.value })
            }
            icon={<Globe className="h-4 w-4" />}
          />
          <Textarea
            label="Notes"
            placeholder="Add notes..."
            value={contactForm.notes}
            onChange={(e) =>
              setContactForm({ ...contactForm, notes: e.target.value })
            }
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Contact</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
