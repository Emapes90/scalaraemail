"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ContactList } from "@/components/contacts/ContactList";
import { PageLoader } from "@/components/ui/Loader";
import type { Contact, ContactGroup } from "@/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  }, []);

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
        showToast("success", "Contact created");
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
          prev
            .map((c) => (c.id === data.data.id ? data.data : c))
            .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        );
        showToast("success", "Contact updated");
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
      const res = await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
        showToast("success", "Contact deleted");
      } else {
        showToast("error", "Failed to delete contact");
      }
    } catch (e) {
      console.error("Failed to delete contact:", e);
      showToast("error", "Network error");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="relative h-full">
      {toast && (
        <div
          className={`absolute top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg animate-fade-in ${
            toast.type === "success"
              ? "bg-green-500/15 border border-green-500/30 text-green-400"
              : "bg-red-500/15 border border-red-500/30 text-red-400"
          }`}
        >
          {toast.text}
        </div>
      )}
      <ContactList
        contacts={contacts}
        groups={groups}
        onCreateContact={handleCreateContact}
        onUpdateContact={handleUpdateContact}
        onDeleteContact={handleDeleteContact}
      />
    </div>
  );
}
