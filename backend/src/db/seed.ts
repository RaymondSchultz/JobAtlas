import { pool } from "./pool.js";

async function seed() {
  console.log("Starting database seeding...");

  // 1. Countries
  const countries = [
    { name: "United States", iso_code: "US" },
    { name: "United Kingdom", iso_code: "GB" },
    { name: "Canada", iso_code: "CA" },
    { name: "Germany", iso_code: "DE" },
    { name: "France", iso_code: "FR" },
    { name: "Japan", iso_code: "JP" },
    { name: "Australia", iso_code: "AU" },
    { name: "India", iso_code: "IN" },
    { name: "Singapore", iso_code: "SG" },
    { name: "Pakistan", iso_code: "PK" },
  ];

  for (const c of countries) {
    await pool.query(
      `INSERT INTO countries (name, iso_code)
       VALUES ($1, $2)
       ON CONFLICT (iso_code) DO NOTHING`,
      [c.name, c.iso_code],
    );
  }

  // 2. Sources
  const sources = [
    { name: "Greenhouse", type: "ats_api", base_url: "https://boards-api.greenhouse.io" },
    { name: "Lever", type: "ats_api", base_url: "https://api.lever.co" },
    { name: "Ashby", type: "ats_api", base_url: "https://api.ashbyhq.com" },
    { name: "Workday", type: "ats_api", base_url: null },
    { name: "Government Jobs", type: "government_feed", base_url: "https://data.usajobs.gov" },
    { name: "Company Website Crawler", type: "company_website", base_url: null },
  ];

  for (const s of sources) {
    await pool.query(
      `INSERT INTO sources (name, type, base_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [s.name, s.type, s.base_url],
    );
  }

  // 3. Categories
  const categories = [
    "Software Engineering",
    "Data & AI",
    "Product Management",
    "Design & UX",
    "Marketing & Growth",
    "Sales & Business Development",
    "Operations & Finance",
    "Customer Support",
  ];

  for (const cat of categories) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await pool.query(
      `INSERT INTO categories (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [cat, slug],
    );
  }

  console.log("Database seeding completed successfully!");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
