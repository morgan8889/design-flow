import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { syncAllProjects } from "@/lib/sync";
import { GitHubClient } from "@/lib/github";

export async function POST() {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    return NextResponse.json({ error: "GitHub PAT not configured" }, { status: 500 });
  }

  const db = getDatabase();
  const github = new GitHubClient(token);

  try {
    await syncAllProjects(db, github);
    return NextResponse.json({ synced: true, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
