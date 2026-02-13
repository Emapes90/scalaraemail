import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  allDay: z.boolean().optional().default(false),
  color: z.string().optional(),
  calendarId: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const where: any = { userId: user.id };
    if (start && end) {
      where.startTime = { lte: new Date(end) };
      where.endTime = { gte: new Date(start) };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      include: { calendar: true },
      orderBy: { startTime: "asc" },
    });

    const calendars = await prisma.calendar.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    // Create default calendar if none exists
    if (calendars.length === 0) {
      const defaultCal = await prisma.calendar.create({
        data: {
          name: "My Calendar",
          color: "#3b82f6",
          isDefault: true,
          userId: user.id,
        },
      });
      calendars.push(defaultCal);
    }

    return NextResponse.json({
      success: true,
      data: { events, calendars },
    });
  } catch (error: any) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch calendar data" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json();
    const validated = eventSchema.parse(body);

    const event = await prisma.calendarEvent.create({
      data: {
        ...validated,
        startTime: new Date(validated.startTime),
        endTime: new Date(validated.endTime),
        userId: user.id,
      },
      include: { calendar: true },
    });

    return NextResponse.json({ success: true, data: event });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 },
      );
    }
    console.error("Calendar create error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create event" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json();
    const { id, ...rawData } = body;

    if (!id)
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 },
      );

    // Only allow known fields to be updated
    const allowedFields = [
      "title",
      "description",
      "location",
      "startTime",
      "endTime",
      "allDay",
      "color",
      "calendarId",
    ];
    const data: Record<string, any> = {};
    for (const key of allowedFields) {
      if (rawData[key] !== undefined) {
        data[key] = rawData[key];
      }
    }

    const event = await prisma.calendarEvent.update({
      where: { id, userId: user.id },
      data: {
        ...data,
        startTime: data.startTime ? new Date(data.startTime) : undefined,
        endTime: data.endTime ? new Date(data.endTime) : undefined,
      },
      include: { calendar: true },
    });

    return NextResponse.json({ success: true, data: event });
  } catch (error: any) {
    console.error("Calendar update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update event" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id)
      return NextResponse.json({ error: "Event ID required" }, { status: 400 });

    await prisma.calendarEvent.delete({
      where: { id, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Calendar delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete event" },
      { status: 500 },
    );
  }
}
