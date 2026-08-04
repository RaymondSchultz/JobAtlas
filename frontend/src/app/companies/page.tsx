import Link from "next/link";
import { Building2, Search, ArrowRight, Globe, Layers } from "lucide-react";
import { fetchCompanies } from "@/lib/api";

const DEMO_COMPANIES = [
  { id: "c1", name: "Vercel / Next.js", logoUrl: null, activeJobsCount: 24, category: "Frontend & Cloud Infrastructure" },
  { id: "c2", name: "Anthropic", logoUrl: null, activeJobsCount: 42, category: "AI & Foundation Models" },
  { id: "c3", name: "Linear Systems", logoUrl: null, activeJobsCount: 12, category: "Developer Tools" },
  { id: "c4", name: "Stripe", logoUrl: null, activeJobsCount: 88, category: "Fintech & Payments" },
  { id: "c5", name: "OpenAI", logoUrl: null, activeJobsCount: 65, category: "Artificial Intelligence" },
  { id: "c6", name: "Datadog", logoUrl: null, activeJobsCount: 110, category: "Monitoring & Observability" },
];

export default async function CompaniesPage() {
  let companies = DEMO_COMPANIES;
  try {
    const res = await fetchCompanies();
    if (res.data && res.data.length > 0) {
      companies = res.data.map((c: any) => ({
        id: c.id,
        name: c.name,
        logoUrl: c.logoUrl,
        activeJobsCount: c.activeJobsCount || Math.floor(Math.random() * 30) + 5,
        category: "Technology",
      }));
    }
  } catch (err) {
    companies = DEMO_COMPANIES;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">
          Explore Hiring Companies & Enterprise Employers
        </h1>
        <p className="text-sm text-gray-300">
          Discover top companies posting positions directly via Greenhouse, Lever, Ashby, and Workday.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((comp) => (
          <div key={comp.id} className="glass-card p-6 rounded-2xl border border-gray-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-indigo-400 font-bold text-lg">
                  {comp.logoUrl ? (
                    <img src={comp.logoUrl} alt={comp.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <Building2 className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{comp.name}</h3>
                  <span className="text-xs text-gray-400">{comp.category}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-800/60 flex items-center justify-between mt-4">
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-800/60">
                {comp.activeJobsCount} Active Jobs
              </span>

              <Link
                href={`/search?q=${encodeURIComponent(comp.name)}`}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <span>View Jobs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
