import cors from "cors";
import express from "express";
import "express-async-errors";
import helmet from "helmet";
import morgan from "morgan";
import { alertsRouter } from "./routes/alerts.js";
import { errorHandler, notFound } from "./errors.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { bookmarksRouter } from "./routes/bookmarks.js";
import { companiesRouter } from "./routes/companies.js";
import { healthRouter } from "./routes/health.js";
import { internalRouter } from "./routes/internal.js";
import { jobsRouter } from "./routes/jobs.js";
import { metadataRouter } from "./routes/metadata.js";
import { resumeRouter } from "./routes/resume.js";
import { searchRouter } from "./routes/search.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("combined"));

  app.use("/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/jobs", jobsRouter);
  app.use("/api/v1/search", searchRouter);
  app.use("/api/v1/companies", companiesRouter);
  app.use("/api/v1/bookmarks", bookmarksRouter);
  app.use("/api/v1/alerts", alertsRouter);
  app.use("/api/v1", resumeRouter);
  app.use("/api/v1", metadataRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/internal", internalRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
