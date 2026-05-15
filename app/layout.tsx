import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageProvider } from "@/components/i18n-provider";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Swift Transfer",
  description: "Swiftly transfer files by Object Storage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LanguageProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="fixed top-4 right-4 z-50 flex gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
            {children}
            <Toaster richColors closeButton />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
