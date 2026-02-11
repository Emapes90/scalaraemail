import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchEmails, mapImapFolderName } from "@/lib/mail";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "inbox";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const search = searchParams.get("search") || "";

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const imapFolder = mapImapFolderName(folder);

    const result = await fetchEmails(
      {
        imapHost: user.imapHost,
        imapPort: user.imapPort,
        smtpHost: user.smtpHost,
        smtpPort: user.smtpPort,
        email: user.email,
        encryptedPassword: user.mailPassword,
      },
      imapFolder,
      page,
      pageSize,
    );

    // Apply client-side search filter if search query is present
    let messages = result.messages;
    if (search) {
      const q = search.toLowerCase();
      messages = messages.filter(
        (m: any) =>
          m.subject?.toLowerCase().includes(q) ||
          m.fromAddress?.toLowerCase().includes(q) ||
          m.fromName?.toLowerCase().includes(q),
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        emails: messages,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
      },
    });
  } catch (error: any) {
    console.error("Email fetch error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch emails" },
      { status: 500 },
    );
  }
}
