"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Search, Sparkles, Bookmark, User, Compass, Layers } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/search", label: "Search Jobs", icon: Search },
    { href: "/resume", label: "AI Resume Match", icon: Sparkles, badge: "AI" },
    { href: "/companies", label: "Companies", icon: Compass },
    { href: "/bookmarks", label: "Saved Jobs", icon: Bookmark },
  ];

  return (
    <header className="sticky top-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-bold gradient-text tracking-tight">JobAtlas</span>
            <span className="hidden sm:inline-block ml-2 text-[10px] uppercase font-semibold tracking-wider text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-800/40">
              AI Aggregator
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                    : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{link.label}</span>
                {link.badge && (
                  <span className="text-[10px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.2 rounded-md uppercase">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800/60 transition-colors"
          >
            <User className="w-4 h-4" />
            <span>Sign In</span>
          </Link>
          <Link
            href="/search"
            className="gradient-button px-4 py-2 rounded-lg text-sm font-medium text-white shadow-md flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" />
            <span>Explore Jobs</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
