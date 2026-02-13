import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";

export const authOptions: NextAuthOptions = {
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
            console.error("[Auth] Missing email or password");
            return null;
          }

          const email = credentials.email.toLowerCase().trim();
          console.log("[Auth] Login attempt for:", email);

          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user) {
            console.error("[Auth] User not found:", email);
            return null;
          }

          if (!user.passwordHash) {
            console.error("[Auth] No password hash for:", email);
            return null;
          }

          const isValid = verifyPassword(
            credentials.password,
            user.passwordHash,
          );

          if (!isValid) {
            console.error("[Auth] Invalid password for:", email);
            console.error(
              "[Auth] Hash format:",
              user.passwordHash.substring(0, 20) + "...",
            );
            return null;
          }

          console.log("[Auth] Login successful for:", email);

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
  secret: process.env.NEXTAUTH_SECRET,
};
