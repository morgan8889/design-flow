import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq, desc, isNotNull, and } from "drizzle-orm";

export async function GET() {
  const db = getDatabase();

  const rows = db
    .select({
      id: schema.pullRequests.id,
      number: schema.pullRequests.number,
      title: schema.pullRequests.title,
      specNumber: schema.pullRequests.specNumber,
      mergedAt: schema.pullRequests.mergedAt,
      htmlUrl: schema.pullRequests.htmlUrl,
      projectId: schema.pullRequests.projectId,
      projectName: schema.projects.name,
    })
    .from(schema.pullRequests)
    .innerJoin(schema.projects, eq(schema.pullRequests.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.pullRequests.state, "merged"),
        isNotNull(schema.pullRequests.specNumber)
      )
    )
    .orderBy(desc(schema.pullRequests.mergedAt))
    .limit(20)
    .all();

  return NextResponse.json(rows);
}
