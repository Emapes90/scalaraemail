import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSettingsSchema = z.object({
  name: z.string().optional(),
  signature: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  emailsPerPage: z.number().min(10).max(100).optional(),
  theme: z.string().optional(),
  notifications: z.boolean().optional(),
  autoRefresh: z.number().min(0).max(300).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        signature: true,
        timezone: true,
        language: true,
        emailsPerPage: true,
        theme: true,
        notifications: true,
        autoRefresh: true,
        imapHost: true,
        imapPort: true,
        smtpHost: true,
        smtpPort: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    console.error("Settings fetch error:", error);
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

    const body = await request.json();

    // Handle password change
    if (body.currentPassword && body.newPassword) {
      const validated = changePasswordSchema.parse(body);

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

      const isValid = await bcrypt.compare(
        validated.currentPassword,
        user.passwordHash,
      );
      if (!isValid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }

      const newHash = await bcrypt.hash(validated.newPassword, 12);
      await prisma.user.update({
        where: { email: session.user.email },
        data: { passwordHash: newHash },
      });

      return NextResponse.json({ success: true, message: "Password updated" });
    }

    // Handle settings update
    const validated = updateSettingsSchema.parse(body);

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: validated,
      select: {
        id: true,
        email: true,
        name: true,
        signature: true,
        timezone: true,
        language: true,
        emailsPerPage: true,
        theme: true,
        notifications: true,
        autoRefresh: true,
      },
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 },
      );
    }
    console.error("Settings update error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
