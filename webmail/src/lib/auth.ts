import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";

const rawUrl = process.env.NEXTAUTH_URL || "";
const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
const useSecureCookies = fullUrl.startsWith("https://");
let hostName: string | undefined;
try {
  hostName = rawUrl ? new URL(fullUrl).hostname : undefined;
} catch {
  console.error("[Auth] Invalid NEXTAUTH_URL:", rawUrl);
  hostName = undefined;
}

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV !== "production",
  providers: [
    CredentialsProvider({
      name: "Scalara",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const email = credentials.email.toLowerCase().trim();
          if (process.env.NODE_ENV !== "production") {
            console.log("[Auth] Login attempt for:", email);
          }

          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user) {
            return null;
          }

          if (!user.passwordHash) {
            return null;
          }

          const isValid = verifyPassword(
            credentials.password,
            user.passwordHash,
          );

          if (!isValid) {
            return null;
          }

          if (process.env.NODE_ENV !== "production") {
            console.log("[Auth] Login successful for:", email);
          }

          // Update last login (non-blocking)
          prisma.user
            .update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            })
            .catch(() => {});

          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email.split("@")[0],
            image: user.avatar,
          };
        } catch (error) {
          console.error("[Auth] Database/connection error:", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  jwt: {
    maxAge: 7 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        domain: hostName
          ? hostName.startsWith(".")
            ? hostName
            : undefined
          : undefined,
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
