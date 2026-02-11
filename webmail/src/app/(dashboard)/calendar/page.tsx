"use client";

import React, { useEffect, useState } from "react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PageLoader } from "@/components/ui/Loader";
import type { CalendarEvent, Calendar } from "@/types";

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);

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
      const data = await res.json();
      if (data.success) {
        setEvents((prev) => [...prev, data.data]);
      }
    } catch (e) {
      console.error("Failed to create event:", e);
    }
  };

  const handleUpdateEvent = async (event: Partial<CalendarEvent>) => {
    try {
      const res = await fetch("/api/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      const data = await res.json();
      if (data.success) {
        setEvents((prev) =>
          prev.map((e) => (e.id === data.data.id ? data.data : e)),
        );
      }
    } catch (e) {
      console.error("Failed to update event:", e);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error("Failed to delete event:", e);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <CalendarView
      events={events}
      calendars={calendars}
      onCreateEvent={handleCreateEvent}
      onUpdateEvent={handleUpdateEvent}
      onDeleteEvent={handleDeleteEvent}
    />
  );
}
