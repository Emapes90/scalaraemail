import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, encrypt } from "@/lib/crypto";
import { z } from "zod";

const updateSettingsSchema = z.object({
  name: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  // Non-nullable DB columns — coerce null/empty to defaults
  timezone: z.string().min(1).optional().default("UTC"),
  language: z.string().min(1).optional().default("en"),
  emailsPerPage: z.number().min(10).max(100).optional().default(50),
  theme: z.string().min(1).optional().default("dark"),
  notifications: z.boolean().optional().default(true),
  autoRefresh: z.number().min(0).max(300).optional().default(30),
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

      const isValid = verifyPassword(
        validated.currentPassword,
        user.passwordHash,
      );
      if (!isValid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }

      const newHash = hashPassword(validated.newPassword);
      await prisma.user.update({
        where: { email: session.user.email },
        data: { passwordHash: newHash },
      });

      return NextResponse.json({ success: true, message: "Password updated" });
    }

    // Handle mail password update (re-encrypt with current ENCRYPTION_KEY)
    if (body.mailPassword && typeof body.mailPassword === "string") {
      const mailPass = body.mailPassword.trim();
      if (mailPass.length < 1) {
        return NextResponse.json(
          { success: false, error: "Mail password cannot be empty" },
          { status: 400 },
        );
      }

      try {
        const encrypted = encrypt(mailPass);
        await prisma.user.update({
          where: { email: session.user.email },
          data: { mailPassword: encrypted },
        });
        return NextResponse.json({
          success: true,
          message: "Mail password updated. Try sending an email now.",
        });
      } catch (err: any) {
        console.error("Mail password encrypt error:", err);
        return NextResponse.json(
          {
            success: false,
            error:
              "Failed to encrypt mail password. Check ENCRYPTION_KEY configuration.",
          },
          { status: 500 },
        );
      }
    }

    // Handle settings update — strip non-settings fields before validation
    const {
      id,
      email,
      avatar,
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
      createdAt,
      lastLoginAt,
      updatedAt,
      passwordHash,
      mailPassword,
      ...settingsOnly
    } = body;

    // Pre-clean: convert null to undefined for non-nullable fields so Zod defaults kick in
    const nonNullableFields = [
      "timezone",
      "language",
      "emailsPerPage",
      "theme",
      "notifications",
      "autoRefresh",
    ];
    for (const field of nonNullableFields) {
      if (settingsOnly[field] === null || settingsOnly[field] === "") {
        delete settingsOnly[field];
      }
    }

    const validated = updateSettingsSchema.parse(settingsOnly);

    // Remove undefined keys so Prisma only updates provided fields
    const cleanData: Record<string, any> = {};
    for (const [key, value] of Object.entries(validated)) {
      if (value !== undefined) cleanData[key] = value;
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: cleanData,
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
