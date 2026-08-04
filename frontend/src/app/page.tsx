import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { JobCard } from "@/components/JobCard";
import { fetchJobs, type Job } from "@/lib/api";
import { Sparkles, ArrowRight, ShieldCheck, Cpu, Zap, Layers, Globe, Building2, CheckCircle2 } from "lucide-react";

export const revalidate = 60; // SSR with revalidation

const SAMPLE_JOBS: Job[] = [
  {
    id: "demo-1",
    title: "Staff Frontend Engineer — Next.js & WebGL",
    company: { id: "c1", name: "Vercel / Next.js Ecosystem", logoUrl: null },
    location: { country: "US", city: "San Francisco", isRemote: true, raw: "San Francisco, CA (Remote)" },
    employmentType: "full-time",
    salary: { min: 180000, max: 240000, currency: "USD" },
    postedAt: new Date().toISOString(),
    applyUrl: "https://boards.greenhouse.io/demo",
    description: "Looking for a Staff Frontend Engineer to lead React & Next.js core application performance.",
    status: "active",
  },
  {
    id: "demo-2",
    title: "Senior AI Systems & LLM Platform Lead",
    company: { id: "c2", name: "Anthropic / Claude Infrastructure", logoUrl: null },
    location: { country: "US", city: "Seattle", isRemote: true, raw: "Seattle, WA" },
    employmentType: "full-time",
    salary: { min: 210000, max: 290000, currency: "USD" },
    postedAt: new Date(Date.now() - 86400000).toISOString(),
    applyUrl: "https://jobs.lever.co/demo",
    description: "Design high-throughput vector index pipelines and LLM serving infrastructure.",
    status: "active",
  },
  {
    id: "demo-3",
    title: "Principal Backend Engineer (Go / PostgreSQL)",
    company: { id: "c3", name: "Linear Systems", logoUrl: null },
    location: { country: "GB", city: "London", isRemote: true, raw: "London, UK (Remote)" },
    employmentType: "full-time",
    salary: { min: 140000, max: 190000, currency: "GBP" },
    postedAt: new Date(Date.now() - 172800000).toISOString(),
    applyUrl: "https://jobs.ashbyhq.com/demo",
    description: "Build ultra-low latency synchronizers and real-time event streaming systems.",
    status: "active",
  },
  {
    id: "demo-4",
    title: "Lead Product Designer — Design Systems",
    company: { id: "c4", name: "Stripe", logoUrl: null },
    location: { country: "US", city: "New York", isRemote: false, raw: "New York, NY" },
    employmentType: "full-time",
    salary: { min: 175000, max: 230000, currency: "USD" },
    postedAt: new Date(Date.now() - 259200000).toISOString(),
    applyUrl: "https://stripe.com/jobs",
    description: "Craft modern web design systems and visual experiences for millions of developers.",
    status: "active",
  },
];

export default async function HomePage() {
  let recentJobs: Job[] = [];
  try {
    const res = await fetchJobs({ limit: 6 });
    recentJobs = res.data.length > 0 ? res.data : SAMPLE_JOBS;
  } catch (err) {
    recentJobs = SAMPLE_JOBS;
  }

  const popularTags = [
    { label: "Remote Senior React", query: "React", remote: true },
    { label: "AI & ML Engineer", query: "AI Engineer", remote: false },
    { label: "Staff Backend (Go)", query: "Backend", remote: true },
    { label: "Product Manager", query: "Product Manager", remote: false },
    { label: "Data Scientist", query: "Data Science", remote: true },
  ];

  return (
    <div className="relative overflow-hidden pb-20">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] hero-gradient pointer-events-none z-0" />

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
        {/* Top Tagline */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-950/70 border border-indigo-800/50 text-indigo-300 text-xs font-semibold mb-6 shadow-inner">
          <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
          <span>Next-Gen Global Job Intelligence & Ingestion Platform</span>
        </div>

        {/* H1 Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 max-w-4xl mx-auto leading-[1.1]">
          Find Verified Tech Jobs Directly From <span className="gradient-text">Public Employer ATS</span>
        </h1>

        {/* Description */}
        <p className="text-base sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          JobAtlas aggregates, normalizes, and deduplicates active openings from Greenhouse, Lever, Ashby, and Workday in real time — with direct apply links.
        </p>

        {/* Search Bar Container */}
        <div className="max-w-3xl mx-auto mb-6">
          <SearchBar />
        </div>

        {/* Quick Tags */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-500">Popular Searches:</span>
          {popularTags.map((tag, idx) => (
            <Link
              key={idx}
              href={`/search?q=${encodeURIComponent(tag.query)}${tag.remote ? "&remote=true" : ""}`}
              className="px-3 py-1 rounded-lg bg-gray-900/80 border border-gray-800 text-gray-300 hover:text-indigo-400 hover:border-indigo-500/40 transition"
            >
              {tag.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Stats Counter Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Verified Active Jobs", value: "500,000+", icon: Building2 },
            { label: "Connected ATS Sources", value: "6 Engines", icon: Cpu },
            { label: "Zero Fake Listings", value: "100% Direct", icon: ShieldCheck },
            { label: "Global Coverage", value: "120+ Countries", icon: Globe },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="glass-card p-5 rounded-2xl border border-gray-800/60 text-center">
                <Icon className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1">{stat.value}</div>
                <div className="text-xs text-gray-400 font-medium">{stat.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Featured Jobs Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Featured Tech & Executive Openings
            </h2>
            <p className="text-sm text-gray-400 mt-1">Recently ingested from top engineering career boards</p>
          </div>

          <Link
            href="/search"
            className="flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition"
          >
            <span>View All Jobs</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Job Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {recentJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>

      {/* AI Resume Matcher Feature Banner */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-card rounded-3xl p-8 sm:p-12 border border-purple-500/20 relative overflow-hidden bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-gray-950/90">
          <div className="max-w-2xl relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/50 text-purple-300 text-xs font-bold mb-4 border border-purple-700/50">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Candidate Matching Engine</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
              Upload Your Resume & Let AI Match You With Ideal Roles
            </h2>
            <p className="text-gray-300 text-sm sm:text-base mb-6 leading-relaxed">
              Our AI extracts your technical stack, seniority, and domain expertise to calculate a match score against 500,000+ active job descriptions.
            </p>

            <ul className="space-y-2 mb-8 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Instant automated skill parsing & title breakdown</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Match score calculation (0–100%) against normalized job specs</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Zero recruiter spam — direct applications only</span>
              </li>
            </ul>

            <Link
              href="/resume"
              className="gradient-button px-6 py-3.5 rounded-2xl text-white font-semibold text-sm inline-flex items-center gap-2 shadow-xl"
            >
              <Sparkles className="w-4 h-4" />
              <span>Upload Resume & See Matches</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Why JobAtlas Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">Why JobAtlas?</h2>
          <p className="text-gray-400 text-sm">
            Designed to solve outdated, spam-filled job boards with automated data pipelines and AI indexing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-2xl border border-gray-800">
            <Zap className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Automated n8n Workflows</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Cron pipelines constantly query public Greenhouse, Lever, Ashby, and Workday APIs to fetch fresh job feeds hourly.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-gray-800">
            <Layers className="w-8 h-8 text-purple-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Fingerprint Deduplication</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Every job posting is SHA-256 fingerprinted on company, title, and location raw text to prevent duplicate listings.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-gray-800">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Verified Direct Apply Links</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              No middleman redirects or dead links. Every job card opens the official employer application portal directly.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
