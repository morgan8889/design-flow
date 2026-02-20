import { getDatabase } from "@/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { SyncScheduler } from "./scheduler";
import { syncAllProjects } from "./sync";
import { GitHubClient } from "./github";

let scheduler: SyncScheduler | null = null;

export function initializeApp(): void {
  const db = getDatabase();

  // Run migrations
  migrate(db, { migrationsFolder: "./drizzle" });

  // Start sync scheduler if PAT is configured
  const token = process.env.GITHUB_PAT;
  if (token) {
    const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS ?? "180000", 10);
    const github = new GitHubClient(token);

    scheduler = new SyncScheduler(async () => {
      await syncAllProjects(db, github);
    }, intervalMs);

    scheduler.start();
    console.log(`Sync scheduler started (interval: ${intervalMs}ms)`);
  } else {
    console.log("No GITHUB_PAT set — sync scheduler not started");
  }
}

export function getScheduler(): SyncScheduler | null {
  return scheduler;
}
