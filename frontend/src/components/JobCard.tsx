"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, MapPin, DollarSign, Clock, ExternalLink, Bookmark, Sparkles, Globe } from "lucide-react";
import type { Job } from "@/lib/api";

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);

  const formatSalary = (min?: number | null, max?: number | null, currency = "USD") => {
    if (!min && !max) return null;
    const currSymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
    if (min && max) return `${currSymbol}${min.toLocaleString()} - ${currSymbol}${max.toLocaleString()}`;
    if (min) return `From ${currSymbol}${min.toLocaleString()}`;
    if (max) return `Up to ${currSymbol}${max.toLocaleString()}`;
    return null;
  };

  const salaryStr = formatSalary(job.salary?.min, job.salary?.max, job.salary?.currency || "USD");

  const getPostedTime = (dateStr?: string | null) => {
    if (!dateStr) return "Recently";
    const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="glass-card rounded-2xl p-6 transition-all duration-300 relative group flex flex-col justify-between">
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-800/80 border border-gray-700/60 flex items-center justify-center text-indigo-400 font-bold text-lg overflow-hidden shrink-0">
              {job.company.logoUrl ? (
                <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-6 h-6 text-indigo-400" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                <Link href={`/jobs/${job.id}`}>{job.title}</Link>
              </h3>
              <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5">
                <span>{job.company.name}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className={`p-2 rounded-xl border transition-all ${
              isBookmarked
                ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400"
                : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
            title={isBookmarked ? "Remove Bookmark" : "Save Job"}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-indigo-400" : ""}`} />
          </button>
        </div>

        {/* Badges & Meta */}
        <div className="flex flex-wrap items-center gap-2 my-4">
          {job.location.isRemote && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
              <Globe className="w-3 h-3" />
              Remote
            </span>
          )}
          {job.location.city && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gray-800/60 text-gray-300 border border-gray-700/40">
              <MapPin className="w-3 h-3 text-gray-400" />
              {job.location.city}
              {job.location.country ? `, ${job.location.country}` : ""}
            </span>
          )}
          {!job.location.city && job.location.raw && !job.location.isRemote && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gray-800/60 text-gray-300 border border-gray-700/40">
              <MapPin className="w-3 h-3 text-gray-400" />
              {job.location.raw}
            </span>
          )}
          {job.employmentType && (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-800/60 text-gray-300 border border-gray-700/40 capitalize">
              {job.employmentType.replace("-", " ")}
            </span>
          )}
          {salaryStr && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-indigo-950/60 text-indigo-300 border border-indigo-800/50">
              <DollarSign className="w-3 h-3 text-indigo-400" />
              {salaryStr}
            </span>
          )}
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="pt-4 border-t border-gray-800/40 flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500 flex items-center gap-1" suppressHydrationWarning>
          <Clock className="w-3.5 h-3.5" />
          {getPostedTime(job.postedAt)}
        </span>

        <div className="flex items-center gap-2">
          <Link
            href={`/jobs/${job.id}`}
            className="text-xs font-medium text-gray-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition"
          >
            Details
          </Link>
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gradient-button text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1 shadow"
          >
            <span>Apply</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
