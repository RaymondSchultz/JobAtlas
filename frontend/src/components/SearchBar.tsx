"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Globe, Sparkles, X } from "lucide-react";
import { fetchSearchSuggestions } from "@/lib/api";

interface SearchBarProps {
  initialQuery?: string;
  initialRemote?: boolean;
}

export function SearchBar({ initialQuery = "", initialRemote = false }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isRemote, setIsRemote] = useState(initialRemote);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const list = await fetchSearchSuggestions(query);
        setSuggestions(list);
      } catch (err) {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (isRemote) params.set("remote", "true");
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="w-full relative">
      <form
        onSubmit={handleSearch}
        className="glass-card p-2 sm:p-3 rounded-2xl sm:rounded-3xl border border-gray-700/50 shadow-2xl flex flex-col sm:flex-row items-center gap-2"
      >
        {/* Keyword Search Input */}
        <div className="relative flex-1 w-full flex items-center px-3 py-2">
          <Search className="w-5 h-5 text-indigo-400 shrink-0 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Job title, skills, or company (e.g. Senior React Engineer)..."
            className="w-full bg-transparent text-white placeholder-gray-400 focus:outline-none text-sm sm:text-base font-medium"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Remote Only Checkbox */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/60 rounded-xl border border-gray-800/80 shrink-0 w-full sm:w-auto justify-center sm:justify-start">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isRemote}
              onChange={(e) => setIsRemote(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700"
            />
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Remote Only</span>
          </label>
        </div>

        {/* Search Submit Button */}
        <button
          type="submit"
          className="gradient-button w-full sm:w-auto px-6 py-3 rounded-xl sm:rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shrink-0"
        >
          <Search className="w-4 h-4" />
          <span>Search Jobs</span>
        </button>
      </form>

      {/* Auto-suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900/95 border border-gray-800 backdrop-blur-xl rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
          <div className="px-4 py-1.5 text-[10px] uppercase font-bold tracking-wider text-gray-500 flex items-center justify-between">
            <span>Suggestions</span>
            <Sparkles className="w-3 h-3 text-indigo-400" />
          </div>
          {suggestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(item);
                setShowSuggestions(false);
                router.push(`/search?q=${encodeURIComponent(item)}${isRemote ? "&remote=true" : ""}`);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 flex items-center gap-2 transition"
            >
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <span>{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
