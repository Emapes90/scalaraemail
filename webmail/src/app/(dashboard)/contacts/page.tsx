"use client";

import React, { useEffect, useState } from "react";
import { ContactList } from "@/components/contacts/ContactList";
import { PageLoader } from "@/components/ui/Loader";
import type { Contact, ContactGroup } from "@/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (data.success) {
        setContacts(data.data.contacts);
        setGroups(data.data.groups);
      }
    } catch (e) {
      console.error("Failed to load contacts:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async (
    contact: any,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      const data = await res.json();
      if (data.success) {
        setContacts((prev) =>
          [...prev, data.data].sort((a, b) =>
            a.displayName.localeCompare(b.displayName),
          ),
        );
        return { success: true };
      }
      return {
        success: false,
        error: data.error || "Failed to create contact",
      };
    } catch (e) {
      console.error("Failed to create contact:", e);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const handleUpdateContact = async (
    contact: any,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/contacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      const data = await res.json();
      if (data.success) {
        setContacts((prev) =>
          prev.map((c) => (c.id === data.data.id ? data.data : c)),
        );
        return { success: true };
      }
      return {
        success: false,
        error: data.error || "Failed to update contact",
      };
    } catch (e) {
      console.error("Failed to update contact:", e);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete contact:", e);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <ContactList
      contacts={contacts}
      groups={groups}
      onCreateContact={handleCreateContact}
      onUpdateContact={handleUpdateContact}
      onDeleteContact={handleDeleteContact}
    />
  );
}
