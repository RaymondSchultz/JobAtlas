"use client";

import { useState } from "react";
import { Cpu, Database, Server, Activity, RefreshCw, CheckCircle2, AlertTriangle, Layers, Play } from "lucide-react";

export default function AdminPage() {
  const [triggering, setTriggering] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleRunTask = (taskName: string) => {
    setTriggering(taskName);
    setMessage(null);
    setTimeout(() => {
      setTriggering(null);
      setMessage(`Successfully triggered ${taskName}!`);
    }, 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between border-b border-gray-800 pb-6 mb-8">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800">
            System Monitoring
          </span>
          <h1 className="text-3xl font-extrabold text-white mt-2">JobAtlas Admin Operations</h1>
        </div>

        <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Cluster Healthy</span>
        </div>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {/* System Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {[
          { name: "PostgreSQL 15 DB", status: "Connected", detail: "Primary relational storage", icon: Database, color: "text-blue-400" },
          { name: "Meilisearch Engine", status: "Healthy & Synced", detail: "Fast keyword & vector index", icon: Cpu, color: "text-purple-400" },
          { name: "n8n Automation", status: "13 Workflows Active", detail: "Cron collectors operational", icon: Server, color: "text-emerald-400" },
          { name: "Job Processor API", status: "Rate: 250 jobs/min", detail: "Express backend API", icon: Activity, color: "text-indigo-400" },
        ].map((sys, idx) => {
          const Icon = sys.icon;
          return (
            <div key={idx} className="glass-card p-6 rounded-2xl border border-gray-800">
              <Icon className={`w-6 h-6 ${sys.color} mb-3`} />
              <h3 className="text-sm font-bold text-white mb-1">{sys.name}</h3>
              <div className="text-xs font-semibold text-emerald-400 mb-1">{sys.status}</div>
              <p className="text-[11px] text-gray-400">{sys.detail}</p>
            </div>
          );
        })}
      </div>

      {/* Manual Actions & Workflows */}
      <div className="glass-card rounded-3xl p-8 border border-gray-800">
        <h2 className="text-lg font-bold text-white mb-4 pb-3 border-b border-gray-800 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          <span>Manual Orchestration Triggers</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: "cleanup", name: "Run Job Cleanup & Expire", desc: "Mark jobs last seen > 30 days ago as expired." },
            { id: "reindex", name: "Reindex Meilisearch", desc: "Force full catalog resync into Meilisearch." },
            { id: "health", name: "Run Health Check Workflow", desc: "Verify connectivity across all 6 collector sources." },
          ].map((action) => (
            <div key={action.id} className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">{action.name}</h4>
                <p className="text-xs text-gray-400 mb-4">{action.desc}</p>
              </div>

              <button
                onClick={() => handleRunTask(action.name)}
                disabled={triggering === action.name}
                className="gradient-button py-2 px-4 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-2 shadow"
              >
                {triggering === action.name ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Trigger Now</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
