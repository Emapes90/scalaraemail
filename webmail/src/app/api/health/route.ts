import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? "SET (" + process.env.DATABASE_URL.replace(/\/\/.*:.*@/, "//***:***@") + ")" : "MISSING",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "MISSING",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? "SET" : "MISSING",
      IMAP_HOST: process.env.IMAP_HOST || "MISSING",
      SMTP_HOST: process.env.SMTP_HOST || "MISSING",
    },
    database: "not tested",
    users: "not tested",
  };

  // Test database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "CONNECTED";

    // Count users
    const count = await prisma.user.count();
    checks.users = `${count} user(s) found`;

    // List emails (without sensitive data)
    if (count > 0) {
      const users = await prisma.user.findMany({
        select: { email: true, name: true, createdAt: true },
        take: 10,
      });
      checks.userList = users;
    }
  } catch (error: any) {
    checks.database = `ERROR: ${error.message}`;
  }

  return NextResponse.json(checks, { status: 200 });
}
