import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  fetchEmailContent,
  deleteEmail,
  toggleEmailFlag,
  moveEmail,
  mapImapFolderName,
} from "@/lib/mail";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "inbox";
    const uid = parseInt(params.id);

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const imapFolder = mapImapFolderName(folder);
    const email = await fetchEmailContent(
      {
        imapHost: user.imapHost,
        imapPort: user.imapPort,
        smtpHost: user.smtpHost,
        smtpPort: user.smtpPort,
        email: user.email,
        encryptedPassword: user.mailPassword,
      },
      imapFolder,
      uid,
    );

    return NextResponse.json({ success: true, data: email });
  } catch (error: any) {
    console.error("Email fetch error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch email" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, folder = "inbox", targetFolder } = body;
    const uid = parseInt(params.id);

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const config = {
      imapHost: user.imapHost,
      imapPort: user.imapPort,
      smtpHost: user.smtpHost,
      smtpPort: user.smtpPort,
      email: user.email,
      encryptedPassword: user.mailPassword,
    };

    const imapFolder = mapImapFolderName(folder);

    switch (action) {
      case "markRead":
        await toggleEmailFlag(config, imapFolder, uid, "\\Seen", true);
        break;
      case "markUnread":
        await toggleEmailFlag(config, imapFolder, uid, "\\Seen", false);
        break;
      case "star":
        await toggleEmailFlag(config, imapFolder, uid, "\\Flagged", true);
        break;
      case "unstar":
        await toggleEmailFlag(config, imapFolder, uid, "\\Flagged", false);
        break;
      case "move":
        if (targetFolder) {
          await moveEmail(
            config,
            imapFolder,
            uid,
            mapImapFolderName(targetFolder),
          );
        }
        break;
      case "trash":
        await moveEmail(config, imapFolder, uid, "Trash");
        break;
      case "spam":
        await moveEmail(config, imapFolder, uid, "Junk");
        break;
      case "archive":
        await moveEmail(config, imapFolder, uid, "Archive");
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Email action error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update email" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "trash";
    const uid = parseInt(params.id);

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const imapFolder = mapImapFolderName(folder);
    await deleteEmail(
      {
        imapHost: user.imapHost,
        imapPort: user.imapPort,
        smtpHost: user.smtpHost,
        smtpPort: user.smtpPort,
        email: user.email,
        encryptedPassword: user.mailPassword,
      },
      imapFolder,
      uid,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Email delete error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete email" },
      { status: 500 },
    );
  }
}
