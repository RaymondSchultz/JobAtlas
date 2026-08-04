import Link from "next/link";
import { Briefcase, Globe, ShieldCheck, Zap, Code2, Share2, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-gray-800/60 bg-gray-950/80 text-gray-400 text-sm mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="space-y-4 md:col-span-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">JobAtlas</span>
          </div>
          <p className="text-xs leading-relaxed text-gray-400">
            Global AI Job Aggregator parsing tech & enterprise opportunities directly from Greenhouse, Lever, Ashby, Workday, and public portals.
          </p>
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational & Ingesting Jobs</span>
          </div>
        </div>

        {/* ATS Integrations */}
        <div>
          <h4 className="text-white font-semibold mb-3 text-xs uppercase tracking-wider">Supported ATS Sources</h4>
          <ul className="space-y-2 text-xs">
            <li><Link href="/search?source=Greenhouse" className="hover:text-indigo-400 transition">Greenhouse Board API</Link></li>
            <li><Link href="/search?source=Lever" className="hover:text-indigo-400 transition">Lever Job API</Link></li>
            <li><Link href="/search?source=Ashby" className="hover:text-indigo-400 transition">Ashby HQ</Link></li>
            <li><Link href="/search?source=Workday" className="hover:text-indigo-400 transition">Workday Enterprise</Link></li>
            <li><Link href="/search?source=Government" className="hover:text-indigo-400 transition">Public USAJobs / Govt</Link></li>
          </ul>
        </div>

        {/* Platform */}
        <div>
          <h4 className="text-white font-semibold mb-3 text-xs uppercase tracking-wider">Platform Features</h4>
          <ul className="space-y-2 text-xs">
            <li><Link href="/search" className="hover:text-indigo-400 transition">Unified Search Engine</Link></li>
            <li><Link href="/resume" className="hover:text-indigo-400 transition">AI Resume Parsing & Match</Link></li>
            <li><Link href="/bookmarks" className="hover:text-indigo-400 transition">Saved Job Collections</Link></li>
            <li><Link href="/alerts" className="hover:text-indigo-400 transition">Custom Email Alerts</Link></li>
            <li><Link href="/admin" className="hover:text-indigo-400 transition">System Monitoring Console</Link></li>
          </ul>
        </div>

        {/* Legal & Info */}
        <div>
          <h4 className="text-white font-semibold mb-3 text-xs uppercase tracking-wider">Developer & API</h4>
          <p className="text-xs text-gray-400 mb-3">
            Built for scalability, high availability, and AI-driven career matching.
          </p>
          <div className="flex items-center gap-3">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white transition">
              <Code2 className="w-4 h-4" />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white transition">
              <Share2 className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-900 py-6 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>&copy; {new Date().getFullYear()} JobAtlas. All rights reserved.</span>
          <span className="flex items-center gap-1">
            Engineered with <Heart className="w-3 h-3 text-pink-500 fill-pink-500 inline" /> for global talent.
          </span>
        </div>
      </div>
    </footer>
  );
}
