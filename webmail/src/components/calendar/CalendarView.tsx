"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Calendar as CalIcon,
  Trash2,
  Edit3,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import type { CalendarEvent, Calendar } from "@/types";

interface CalendarViewProps {
  events: CalendarEvent[];
  calendars: Calendar[];
  onCreateEvent: (event: Partial<CalendarEvent>) => void;
  onUpdateEvent: (event: Partial<CalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
}

export function CalendarView({
  events,
  calendars,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showEventDetail, setShowEventDetail] = useState<CalendarEvent | null>(
    null,
  );
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
    allDay: false,
    calendarId: "",
    color: "",
  });

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getEventsForDay = (date: Date) =>
    events.filter((e) => isSameDay(new Date(e.startTime), date));

  const handleCreateClick = (date?: Date) => {
    const d = date || new Date();
    setEditingEventId(null);
    setEventForm({
      title: "",
      description: "",
      location: "",
      startTime: format(d, "yyyy-MM-dd'T'09:00"),
      endTime: format(d, "yyyy-MM-dd'T'10:00"),
      allDay: false,
      calendarId: calendars[0]?.id || "",
      color: "",
    });
    setShowEventModal(true);
  };

  const handleEditClick = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setEventForm({
      title: event.title,
      description: event.description || "",
      location: event.location || "",
      startTime: format(new Date(event.startTime), "yyyy-MM-dd'T'HH:mm"),
      endTime: format(new Date(event.endTime), "yyyy-MM-dd'T'HH:mm"),
      allDay: event.allDay,
      calendarId: event.calendarId,
      color: event.color || "",
    });
    setShowEventDetail(null);
    setShowEventModal(true);
  };

  const handleSubmitEvent = () => {
    if (!eventForm.title || !eventForm.startTime || !eventForm.endTime) return;
    const payload = {
      ...eventForm,
      startTime: new Date(eventForm.startTime).toISOString(),
      endTime: new Date(eventForm.endTime).toISOString(),
    };
    if (editingEventId) {
      onUpdateEvent({ id: editingEventId, ...payload });
    } else {
      onCreateEvent(payload);
    }
    setEditingEventId(null);
    setShowEventModal(false);
  };

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-scalara-border">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(new Date())}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button
          onClick={() => handleCreateClick()}
          icon={<Plus className="h-4 w-4" />}
        >
          New Event
        </Button>
      </div>

      {/* Calendars Sidebar + Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mini Sidebar */}
        <div className="w-56 border-r border-scalara-border p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div>
            <h3 className="text-xs font-semibold text-scalara-muted uppercase tracking-wider mb-2">
              My Calendars
            </h3>
            <div className="space-y-1">
              {calendars.map((cal) => (
                <label
                  key={cal.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-scalara-hover cursor-pointer transition-colors"
                >
                  <div
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: cal.color }}
                  />
                  <span className="text-sm text-scalara-muted-foreground">
                    {cal.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Upcoming Events */}
          <div>
            <h3 className="text-xs font-semibold text-scalara-muted uppercase tracking-wider mb-2">
              Upcoming
            </h3>
            <div className="space-y-1.5">
              {events
                .filter((e) => new Date(e.startTime) >= new Date())
                .slice(0, 5)
                .map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setShowEventDetail(event)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-scalara-hover transition-colors"
                  >
                    <p className="text-sm text-white truncate">{event.title}</p>
                    <p className="text-xs text-scalara-muted">
                      {format(new Date(event.startTime), "MMM d, h:mm a")}
                    </p>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-scalara-border">
            {weekDays.map((d) => (
              <div
                key={d}
                className="px-3 py-2 text-xs font-semibold text-scalara-muted text-center"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="flex-1 grid grid-cols-7 auto-rows-fr">
            {days.map((day, i) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);

              return (
                <div
                  key={i}
                  onClick={() => handleCreateClick(day)}
                  className={cn(
                    "border-b border-r border-scalara-border/50 p-1.5 cursor-pointer transition-colors min-h-0",
                    "hover:bg-scalara-hover/50",
                    !isCurrentMonth && "opacity-30",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                        today
                          ? "bg-white text-black"
                          : "text-scalara-muted-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEventDetail(event);
                        }}
                        className="w-full text-left px-1.5 py-0.5 rounded text-2xs truncate transition-colors"
                        style={{
                          backgroundColor: `${event.color || event.calendar?.color || "#3b82f6"}20`,
                          color:
                            event.color || event.calendar?.color || "#3b82f6",
                        }}
                      >
                        {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-2xs text-scalara-muted px-1">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create/Edit Event Modal */}
      <Modal
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setEditingEventId(null);
        }}
        title={editingEventId ? "Edit Event" : "New Event"}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="Event title"
            value={eventForm.title}
            onChange={(e) =>
              setEventForm({ ...eventForm, title: e.target.value })
            }
            autoFocus
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start"
              type="datetime-local"
              value={eventForm.startTime}
              onChange={(e) =>
                setEventForm({ ...eventForm, startTime: e.target.value })
              }
            />
            <Input
              label="End"
              type="datetime-local"
              value={eventForm.endTime}
              onChange={(e) =>
                setEventForm({ ...eventForm, endTime: e.target.value })
              }
            />
          </div>
          <Input
            label="Location"
            placeholder="Add location"
            value={eventForm.location}
            onChange={(e) =>
              setEventForm({ ...eventForm, location: e.target.value })
            }
            icon={<MapPin className="h-4 w-4" />}
          />
          <Textarea
            label="Description"
            placeholder="Add description"
            value={eventForm.description}
            onChange={(e) =>
              setEventForm({ ...eventForm, description: e.target.value })
            }
            rows={3}
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={eventForm.allDay}
                onChange={(e) =>
                  setEventForm({ ...eventForm, allDay: e.target.checked })
                }
                className="rounded border-scalara-border bg-scalara-card"
              />
              <span className="text-sm text-scalara-muted-foreground">
                All day
              </span>
            </label>
          </div>
          {calendars.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-scalara-muted-foreground mb-1.5">
                Calendar
              </label>
              <select
                value={eventForm.calendarId}
                onChange={(e) =>
                  setEventForm({ ...eventForm, calendarId: e.target.value })
                }
                className="w-full h-10 rounded-lg bg-scalara-card border border-scalara-border px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10"
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowEventModal(false);
                setEditingEventId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitEvent}>
              {editingEventId ? "Save Changes" : "Create Event"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Event Detail Modal */}
      <Modal
        isOpen={!!showEventDetail}
        onClose={() => setShowEventDetail(null)}
        title={showEventDetail?.title || ""}
        size="sm"
      >
        {showEventDetail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-scalara-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {format(
                  new Date(showEventDetail.startTime),
                  "MMM d, yyyy h:mm a",
                )}
                {" — "}
                {format(new Date(showEventDetail.endTime), "h:mm a")}
              </span>
            </div>
            {showEventDetail.location && (
              <div className="flex items-center gap-2 text-sm text-scalara-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{showEventDetail.location}</span>
              </div>
            )}
            {showEventDetail.description && (
              <p className="text-sm text-scalara-muted-foreground">
                {showEventDetail.description}
              </p>
            )}
            {showEventDetail.calendar && (
              <div className="flex items-center gap-2 text-sm text-scalara-muted-foreground">
                <CalIcon className="h-4 w-4" />
                <span>{showEventDetail.calendar.name}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onDeleteEvent(showEventDetail.id);
                  setShowEventDetail(null);
                }}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Edit3 className="h-3.5 w-3.5" />}
                onClick={() => handleEditClick(showEventDetail)}
              >
                Edit
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
