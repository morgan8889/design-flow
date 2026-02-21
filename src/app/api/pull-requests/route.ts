import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const db = getDatabase();
  const prs = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.projectId, projectId))
    .orderBy(desc(schema.pullRequests.mergedAt))
    .all();

  return NextResponse.json(prs);
}
