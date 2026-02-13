import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths
  const publicPaths = ["/login", "/api/auth", "/api/health"];
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublic) {
    return NextResponse.next();
  }

  // Check authentication — try both cookie names (http vs https)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // If user just came from login, avoid infinite loop
    const referer = request.headers.get("referer") || "";
    if (referer.includes("/login")) {
      console.error("[Middleware] Token not found after login. Cookie issue.");
      console.error("[Middleware] NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
      console.error("[Middleware] Request URL:", request.url);
      console.error(
        "[Middleware] Cookies:",
        request.cookies
          .getAll()
          .map((c) => c.name)
          .join(", "),
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Security headers
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
