import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Excerpt | Premium AI Video Clipping",
  description: "Transform long videos into premium viral clips with AI.",
  keywords: ["AI video editing", "viral clips", "video automation", "short form video"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth dark">
      <body className="font-sans antialiased min-h-screen overflow-x-hidden selection:bg-primary/30">
        <div className="fixed inset-0 cyber-grid opacity-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col min-h-screen">
          <AuthProvider>{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
