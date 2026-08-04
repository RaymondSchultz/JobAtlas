"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Upload, FileText, CheckCircle2, Award, Zap, ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";

interface MatchResult {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
}

const DEMO_MATCHES: MatchResult[] = [
  {
    id: "demo-1",
    title: "Staff Frontend Engineer — Next.js & WebGL",
    company: "Vercel / Next.js Ecosystem",
    location: "San Francisco, CA (Remote)",
    matchScore: 96,
    matchingSkills: ["React", "Next.js", "TypeScript", "Tailwind CSS", "REST API"],
    missingSkills: ["WebGL", "Three.js"],
  },
  {
    id: "demo-2",
    title: "Senior Full Stack Engineer",
    company: "Linear Systems",
    location: "London, UK (Remote)",
    matchScore: 91,
    matchingSkills: ["Node.js", "TypeScript", "PostgreSQL", "React", "Docker"],
    missingSkills: ["Go", "Redis"],
  },
  {
    id: "demo-3",
    title: "Principal AI Platform Lead",
    company: "Anthropic",
    location: "Seattle, WA",
    matchScore: 84,
    matchingSkills: ["Python", "PostgreSQL", "REST API", "Docker"],
    missingSkills: ["PyTorch", "Kubernetes"],
  },
];

export default function ResumePage() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleStartAnalysis = () => {
    if (!file) return;
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
    }, 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-950/70 border border-purple-800/50 text-purple-300 text-xs font-semibold mb-4">
          <Sparkles className="w-4 h-4 text-pink-400" />
          <span>AI Resume Parsing & Job Recommendation Engine</span>
        </div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-4">
          Upload Your Resume to Discover <span className="gradient-text">Instant Job Matches</span>
        </h1>
        <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
          Our deep parsing engine analyzes your experience, key technical competencies, and role preferences against 500,000+ active listings.
        </p>
      </div>

      {/* Main Upload Box */}
      <div className="glass-card rounded-3xl p-8 sm:p-12 border border-gray-800 max-w-3xl mx-auto mb-12 text-center">
        {!analyzed ? (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-gray-700 hover:border-indigo-500/60 transition-colors rounded-2xl p-8 sm:p-12 bg-gray-950/40">
              <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-1">
                {file ? file.name : "Drag & Drop your Resume here"}
              </h3>
              <p className="text-xs text-gray-400 mb-6">Supports PDF or DOCX formats (Max size 10MB)</p>

              <label className="gradient-button px-6 py-3 rounded-xl text-white font-semibold text-sm cursor-pointer inline-flex items-center gap-2 shadow-lg">
                <FileText className="w-4 h-4" />
                <span>{file ? "Change File" : "Select File"}</span>
                <input type="file" accept=".pdf,.docx,.doc" onChange={handleFileDrop} className="hidden" />
              </label>
            </div>

            {file && (
              <button
                onClick={handleStartAnalysis}
                disabled={analyzing}
                className="w-full gradient-button py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Parsing Resume & Calculating Scores...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Run AI Skill Extraction & Job Matching</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          /* Analysis Results Showcase */
          <div className="space-y-8 text-left">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">Analysis Complete</span>
                <h2 className="text-2xl font-bold text-white">Extracted Resume Profile</h2>
              </div>
              <button
                onClick={() => setAnalyzed(false)}
                className="text-xs text-indigo-400 hover:underline"
              >
                Upload Different File
              </button>
            </div>

            {/* Extracted Skills Badges */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Detected Primary Technical Skills</h3>
              <div className="flex flex-wrap gap-2">
                {["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL", "Tailwind CSS", "Docker", "REST API", "Git", "System Design"].map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 rounded-lg bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-xs font-semibold">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Match Results */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Top AI Job Recommendations</h3>
              <div className="space-y-4">
                {DEMO_MATCHES.map((match) => (
                  <div key={match.id} className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {match.matchScore}% Match Score
                        </span>
                        <span className="text-xs text-gray-400">{match.location}</span>
                      </div>
                      <h4 className="text-lg font-bold text-white">{match.title}</h4>
                      <p className="text-xs text-gray-300">{match.company}</p>
                    </div>

                    <Link
                      href={`/jobs/${match.id}`}
                      className="gradient-button px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1 shrink-0"
                    >
                      <span>View Role</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
