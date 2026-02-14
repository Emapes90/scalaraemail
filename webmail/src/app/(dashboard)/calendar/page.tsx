"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PageLoader } from "@/components/ui/Loader";
import type { CalendarEvent, Calendar } from "@/types";

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
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
    loadCalendarData();
  }, []);

  const loadCalendarData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      if (data.success) {
        setEvents(data.data.events);
        setCalendars(data.data.calendars);
      }
    } catch (e) {
      console.error("Failed to load calendar:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (event: Partial<CalendarEvent>) => {
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        showToast("error", "Failed to create event");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setEvents((prev) => [...prev, data.data]);
        showToast("success", "Event created");
      } else {
        showToast("error", data.error || "Failed to create event");
      }
    } catch (e) {
      console.error("Failed to create event:", e);
      showToast("error", "Network error creating event");
    }
  };

  const handleUpdateEvent = async (event: Partial<CalendarEvent>) => {
    try {
      const res = await fetch("/api/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        showToast("error", "Failed to update event");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setEvents((prev) =>
          prev.map((e) => (e.id === data.data.id ? data.data : e)),
        );
        showToast("success", "Event updated");
      } else {
        showToast("error", data.error || "Failed to update event");
      }
    } catch (e) {
      console.error("Failed to update event:", e);
      showToast("error", "Network error updating event");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("error", "Failed to delete event");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        showToast("success", "Event deleted");
      } else {
        showToast("error", data.error || "Failed to delete event");
      }
    } catch (e) {
      console.error("Failed to delete event:", e);
      showToast("error", "Network error deleting event");
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
      <CalendarView
        events={events}
        calendars={calendars}
        onCreateEvent={handleCreateEvent}
        onUpdateEvent={handleUpdateEvent}
        onDeleteEvent={handleDeleteEvent}
      />
    </div>
  );
}
