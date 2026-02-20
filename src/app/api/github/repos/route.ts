import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { GitHubClient } from "@/lib/github";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

export async function POST() {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    return NextResponse.json({ error: "GitHub PAT not configured" }, { status: 500 });
  }

  const db = getDatabase();
  const github = new GitHubClient(token);
  const repos = await github.listRepos();

  let added = 0;
  for (const repo of repos) {
    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.githubUrl, repo.htmlUrl))
      .get();

    if (!existing) {
      db.insert(schema.projects).values({
        id: uuid(),
        name: repo.name,
        githubUrl: repo.htmlUrl,
        source: "github_discovered",
        isTracked: false,
      }).run();
      added++;
    }
  }

  return NextResponse.json({ discovered: repos.length, added });
}
