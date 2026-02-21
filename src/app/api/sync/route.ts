import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncAllProjects } from "@/lib/sync";
import { GitHubClient } from "@/lib/github";

export async function POST() {
  const db = getDatabase();
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "github_pat")).get();
  const token = process.env.GITHUB_PAT ?? row?.value;
  if (!token) {
    return NextResponse.json({ error: "GitHub PAT not configured" }, { status: 500 });
  }

  const github = new GitHubClient(token);

  try {
    await syncAllProjects(db, github);
    return NextResponse.json({ synced: true, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
