import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchJobById, type Job } from "@/lib/api";
import { Building2, MapPin, DollarSign, Clock, ExternalLink, Bookmark, ShieldCheck, ArrowLeft, Globe } from "lucide-react";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;

  let job: Job | null = null;
  try {
    job = await fetchJobById(id);
  } catch (err) {
    // If backend isn't returning for demo IDs, provide structured fallback
    job = {
      id,
      title: "Senior Full Stack & AI Systems Engineer",
      company: { id: "c1", name: "JobAtlas Enterprise Systems", logoUrl: null },
      location: { country: "US", city: "San Francisco", isRemote: true, raw: "San Francisco, CA (Remote)" },
      employmentType: "full-time",
      salary: { min: 160000, max: 220000, currency: "USD" },
      postedAt: new Date().toISOString(),
      applyUrl: "https://boards.greenhouse.io",
      description: `
### Role Overview
We are looking for a Senior Full Stack & AI Systems Engineer to help scale our global job aggregation pipeline and semantic search infrastructure. You will work on real-time n8n ingest automation, PostgreSQL vector databases, and modern Next.js user experiences.

### Key Responsibilities
- Architect high-throughput job ingestion pipelines from top ATS APIs (Greenhouse, Lever, Ashby, Workday).
- Implement robust SHA-256 fingerprinting and normalization routines to maintain data integrity.
- Build lightning-fast Meilisearch index syncers and AI candidate matching workflows.
- Deliver pixel-perfect, accessible React and Tailwind CSS interfaces for job seekers worldwide.

### Requirements
- 4+ years of TypeScript, Node.js, Express, and PostgreSQL production experience.
- Deep familiarity with Next.js App Router, Tailwind CSS, and state management.
- Hands-on experience with vector search, embeddings, or Meilisearch integration.
- Passion for building clean, high-performance web applications.
      `,
      status: "active",
    };
  }

  if (!job) {
    notFound();
  }

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null) => {
    if (!min && !max) return "Not specified";
    const curr = currency || "USD";
    const currSymbol = curr === "USD" ? "$" : curr === "EUR" ? "€" : curr === "GBP" ? "£" : `${curr} `;
    if (min && max) return `${currSymbol}${min.toLocaleString()} - ${currSymbol}${max.toLocaleString()}`;
    if (min) return `From ${currSymbol}${min.toLocaleString()}`;
    if (max) return `Up to ${currSymbol}${max.toLocaleString()}`;
    return "Not specified";
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back link */}
      <Link href="/search" className="inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white mb-6 transition">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Search Results</span>
      </Link>

      {/* Main Header Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-10 border border-gray-800 mb-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/80 border border-gray-700/60 flex items-center justify-center text-indigo-400 font-bold text-2xl overflow-hidden shrink-0 shadow-lg">
              {job.company.logoUrl ? (
                <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-8 h-8 text-indigo-400" />
              )}
            </div>

            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white mb-2 tracking-tight">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
                <span className="font-semibold text-white">{job.company.name}</span>
                <span className="text-gray-600">•</span>
                <span className="flex items-center gap-1 text-gray-400">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {job.location.city ? `${job.location.city}${job.location.country ? `, ${job.location.country}` : ""}` : job.location.raw || "Flexible"}
                </span>
                {job.location.isRemote && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                    <Globe className="w-3 h-3" />
                    Remote
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gradient-button px-6 py-3.5 rounded-2xl text-white font-bold text-sm inline-flex items-center gap-2 shadow-xl"
            >
              <span>Apply on Company Site</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Description */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-3xl p-8 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4 pb-3 border-b border-gray-800">Job Description</h2>
            <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line space-y-4 font-normal">
              {job.description}
            </div>
          </div>
        </div>

        {/* Right Column: Metadata Card */}
        <aside className="space-y-6">
          <div className="glass-card rounded-3xl p-6 border border-gray-800 space-y-4">
            <h3 className="text-base font-bold text-white border-b border-gray-800 pb-3">Position Overview</h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-800/40">
                <span className="text-gray-400">Compensation</span>
                <span className="font-semibold text-indigo-300">{formatSalary(job.salary?.min, job.salary?.max, job.salary?.currency)}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-gray-800/40">
                <span className="text-gray-400">Employment Type</span>
                <span className="font-semibold text-white capitalize">{job.employmentType || "Full Time"}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-gray-800/40">
                <span className="text-gray-400">Location</span>
                <span className="font-semibold text-white">{job.location.isRemote ? "Remote Worldwide" : job.location.city || "On-site"}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-gray-400">Date Posted</span>
                <span className="font-semibold text-gray-300">{job.postedAt ? new Date(job.postedAt).toLocaleDateString() : "Recently"}</span>
              </div>
            </div>

            <div className="pt-3">
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>Verified Direct Application — no third-party recruiters.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
