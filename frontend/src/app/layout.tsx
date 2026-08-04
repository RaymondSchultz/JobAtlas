import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobAtlas — Global Job Aggregator & AI Search Platform",
  description:
    "Aggregating verified tech, engineering, and corporate jobs directly from Greenhouse, Lever, Ashby, Workday, and public sources. Powered by AI search and resume matching.",
  keywords: ["Job Search", "AI Resume Matcher", "Greenhouse Jobs", "Lever Jobs", "Remote Software Engineer Jobs", "Job Aggregator"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#0b0f19] text-gray-100 selection:bg-indigo-500 selection:text-white" suppressHydrationWarning>
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
