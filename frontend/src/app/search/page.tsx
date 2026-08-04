"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { JobCard } from "@/components/JobCard";
import { searchJobs, type Job } from "@/lib/api";
import { Filter, SlidersHorizontal, ArrowUpDown, Loader2, Sparkles, AlertCircle } from "lucide-react";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q = searchParams.get("q") || "";
  const remoteParam = searchParams.get("remote") === "true";
  const typeParam = searchParams.get("employmentType") || "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [remoteOnly, setRemoteOnly] = useState(remoteParam);
  const [employmentType, setEmploymentType] = useState(typeParam);
  const [sortBy, setSortBy] = useState("latest");

  useEffect(() => {
    setRemoteOnly(remoteParam);
    setEmploymentType(typeParam);

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const filters: Record<string, any> = {};
        if (remoteParam) filters.remote = true;
        if (typeParam) filters.employmentType = typeParam;

        const res = await searchJobs(q, filters);
        if (isMounted) {
          setJobs(res.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load jobs");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [q, remoteParam, typeParam]);

  const updateFilters = (newRemote: boolean, newType: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (newRemote) params.set("remote", "true");
    if (newType) params.set("employmentType", newType);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header & Search Input */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">Search Job Openings</h1>
        <p className="text-sm text-gray-400 mb-6">
          Filter verified positions from Greenhouse, Lever, Ashby, and Workday.
        </p>
        <SearchBar initialQuery={q} initialRemote={remoteParam} />
      </div>

      {/* Main Grid: Sidebar + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Sidebar Filters */}
        <aside className="glass-card rounded-2xl p-6 border border-gray-800 space-y-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between border-b border-gray-800 pb-4">
            <h2 className="font-bold text-white flex items-center gap-2 text-base">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
              <span>Filter Options</span>
            </h2>
            {(remoteOnly || employmentType) && (
              <button
                onClick={() => updateFilters(false, "")}
                className="text-xs text-indigo-400 hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {/* Remote Toggle */}
          <div>
            <label className="flex items-center justify-between text-sm font-semibold text-gray-200 cursor-pointer select-none">
              <span>Remote Only</span>
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => updateFilters(e.target.checked, employmentType)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700"
              />
            </label>
          </div>

          {/* Employment Type */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Employment Type</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: "All Types", value: "" },
                { label: "Full Time", value: "full-time" },
                { label: "Part Time", value: "part-time" },
                { label: "Contract", value: "contract" },
                { label: "Internship", value: "internship" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-gray-300 hover:text-white cursor-pointer">
                  <input
                    type="radio"
                    name="employmentType"
                    value={opt.value}
                    checked={employmentType === opt.value}
                    onChange={() => updateFilters(remoteOnly, opt.value)}
                    className="text-indigo-600 bg-gray-800 border-gray-700 focus:ring-indigo-500"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Search Results List */}
        <main className="lg:col-span-3 space-y-6">
          {/* Results Bar */}
          <div className="flex items-center justify-between bg-gray-900/60 p-4 rounded-2xl border border-gray-800 text-xs text-gray-400">
            <div>
              Showing <span className="font-bold text-white">{jobs.length}</span> verified results
              {q && <span> for "<span className="text-indigo-300 font-semibold">{q}</span>"</span>}
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
              <span>Sort: Latest Posted</span>
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
              <p className="text-sm">Searching active job postings...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="glass-card p-6 rounded-2xl border border-red-500/30 text-center text-red-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && jobs.length === 0 && (
            <div className="glass-card p-12 rounded-3xl text-center border border-gray-800">
              <Sparkles className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-white mb-2">No Matching Jobs Found</h3>
              <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
                We couldn't find active jobs matching your criteria. Try adjusting your query or resetting filters.
              </p>
              <button
                onClick={() => updateFilters(false, "")}
                className="gradient-button px-5 py-2.5 rounded-xl text-white font-semibold text-xs inline-flex items-center gap-2"
              >
                Reset All Filters
              </button>
            </div>
          )}

          {/* Job List Grid */}
          {!loading && !error && jobs.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">Loading Search Engine...</div>}>
      <SearchContent />
    </Suspense>
  );
}
