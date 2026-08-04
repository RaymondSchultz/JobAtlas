export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export interface Job {
  id: string;
  title: string;
  company: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
  location: {
    country?: string | null;
    city?: string | null;
    isRemote: boolean;
    raw?: string | null;
  };
  employmentType?: string | null;
  salary: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
  };
  postedAt?: string | null;
  applyUrl: string;
  description?: string;
  descriptionHtml?: string;
  status?: string;
}

export interface SearchResponse {
  data: Job[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  meta?: {
    tookMs: number;
    totalEstimate: number;
    mode: string;
  };
}

export async function fetchJobs(params: Record<string, string | boolean | number> = {}): Promise<SearchResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, String(val));
    }
  });

  const res = await fetch(`${API_BASE_URL}/jobs?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch jobs: ${res.statusText}`);
  }
  return res.json();
}

export async function searchJobs(queryText: string, filters: Record<string, any> = {}): Promise<SearchResponse> {
  const query = new URLSearchParams();
  if (queryText) query.set("q", queryText);

  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, String(val));
    }
  });

  const res = await fetch(`${API_BASE_URL}/search?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`Search failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchJobById(id: string): Promise<Job> {
  const res = await fetch(`${API_BASE_URL}/jobs/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job details`);
  }
  return res.json();
}

export async function fetchCompanies(): Promise<{ data: any[] }> {
  const res = await fetch(`${API_BASE_URL}/companies`);
  if (!res.ok) return { data: [] };
  return res.json();
}

export async function fetchSearchSuggestions(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  const res = await fetch(`${API_BASE_URL}/search/suggestions?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}
