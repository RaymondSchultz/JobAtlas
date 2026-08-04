"use client";

import Link from "next/link";
import { Bookmark, Sparkles, ArrowRight } from "lucide-react";

export default function BookmarksPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between border-b border-gray-800 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Saved Job Openings</h1>
          <p className="text-sm text-gray-400 mt-1">Keep track of roles you intend to apply to.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
          <Bookmark className="w-3.5 h-3.5 fill-indigo-400 text-indigo-400" />
          <span>Local Session Collection</span>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-12 text-center border border-gray-800 max-w-2xl mx-auto">
        <Bookmark className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Bookmarked Jobs Yet</h2>
        <p className="text-sm text-gray-400 mb-6">
          Browse through live opportunities and click the bookmark icon on any job card to save it here.
        </p>
        <Link
          href="/search"
          className="gradient-button px-6 py-3 rounded-xl text-white font-semibold text-xs inline-flex items-center gap-2 shadow-lg"
        >
          <span>Explore Job Directory</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
