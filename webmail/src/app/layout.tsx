import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Scalara — Premium Webmail",
  description: "Scalara is a premium, secure, and modern webmail client.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-scalara-bg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
