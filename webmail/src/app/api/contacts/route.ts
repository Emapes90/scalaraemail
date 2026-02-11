import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const contactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().min(1),
  emails: z
    .array(
      z.object({
        email: z.string().email(),
        type: z.string().default("personal"),
        isPrimary: z.boolean().default(false),
      }),
    )
    .optional()
    .default([]),
  phones: z
    .array(
      z.object({
        phone: z.string(),
        type: z.string().default("mobile"),
        isPrimary: z.boolean().default(false),
      }),
    )
    .optional()
    .default([]),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  birthday: z.string().optional(),
  isFavorite: z.boolean().optional().default(false),
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
    const search = searchParams.get("search") || "";
    const group = searchParams.get("group");

    const where: any = { userId: user.id };
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
        {
          emails: {
            some: { email: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        emails: true,
        phones: true,
        groups: { include: { group: true } },
      },
      orderBy: { displayName: "asc" },
    });

    const groups = await prisma.contactGroup.findMany({
      where: { userId: user.id },
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        contacts: contacts.map((c) => ({
          ...c,
          groups: c.groups.map((g) => g.group),
        })),
        groups: groups.map((g) => ({
          ...g,
          memberCount: g._count.members,
        })),
      },
    });
  } catch (error: any) {
    console.error("Contacts fetch error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
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
    const validated = contactSchema.parse(body);

    const contact = await prisma.contact.create({
      data: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        displayName: validated.displayName,
        company: validated.company,
        jobTitle: validated.jobTitle,
        website: validated.website,
        address: validated.address,
        notes: validated.notes,
        birthday: validated.birthday ? new Date(validated.birthday) : null,
        isFavorite: validated.isFavorite,
        userId: user.id,
        emails: {
          create: validated.emails,
        },
        phones: {
          create: validated.phones,
        },
      },
      include: {
        emails: true,
        phones: true,
      },
    });

    return NextResponse.json({ success: true, data: contact });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 },
      );
    }
    console.error("Contact create error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
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
    const { id, emails: emailList, phones: phoneList, ...data } = body;

    if (!id)
      return NextResponse.json(
        { error: "Contact ID required" },
        { status: 400 },
      );

    // Delete existing emails/phones, recreate
    await prisma.contactEmail.deleteMany({ where: { contactId: id } });
    await prisma.contactPhone.deleteMany({ where: { contactId: id } });

    const contact = await prisma.contact.update({
      where: { id, userId: user.id },
      data: {
        ...data,
        birthday: data.birthday ? new Date(data.birthday) : null,
        emails: emailList ? { create: emailList } : undefined,
        phones: phoneList ? { create: phoneList } : undefined,
      },
      include: { emails: true, phones: true },
    });

    return NextResponse.json({ success: true, data: contact });
  } catch (error: any) {
    console.error("Contact update error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
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
      return NextResponse.json(
        { error: "Contact ID required" },
        { status: 400 },
      );

    await prisma.contact.delete({ where: { id, userId: user.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Contact delete error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
