import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { z } from "zod";

const sendEmailSchema = z
  .object({
    to: z
      .array(z.string().email())
      .min(1, "At least one recipient is required"),
    cc: z.array(z.string().email()).optional().default([]),
    bcc: z.array(z.string().email()).optional().default([]),
    subject: z.string().min(1, "Subject is required"),
    body: z.string().min(1, "Message body is required"),
    inReplyTo: z.string().optional(),
    isHtml: z.boolean().optional().default(false),
  })
  .transform((data) => ({
    ...data,
    // Filter out any empty strings that might slip through
    cc: data.cc.filter(Boolean),
    bcc: data.bcc.filter(Boolean),
  }));

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = sendEmailSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.mailPassword) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Mail password not configured. Please contact your admin to set up your email account.",
        },
        { status: 400 },
      );
    }

    if (!user.smtpHost || !user.smtpPort) {
      return NextResponse.json(
        {
          success: false,
          error: "SMTP server not configured. Please contact your admin.",
        },
        { status: 400 },
      );
    }

    const result = await sendEmail(
      {
        imapHost: user.imapHost,
        imapPort: user.imapPort,
        smtpHost: user.smtpHost,
        smtpPort: user.smtpPort,
        email: user.email,
        encryptedPassword: user.mailPassword,
      },
      {
        to: validated.to,
        cc: validated.cc,
        bcc: validated.bcc,
        subject: validated.subject,
        text: validated.isHtml ? undefined : validated.body,
        html: validated.isHtml ? validated.body : undefined,
        inReplyTo: validated.inReplyTo,
      },
    );

    return NextResponse.json({
      success: true,
      data: { messageId: result.messageId },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 },
      );
    }

    console.error("Send email error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to send email" },
      { status: 500 },
    );
  }
}
