import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const db = getDatabase();

  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const plans = db.select().from(schema.plans).where(eq(schema.plans.projectId, projectId)).all();

  return NextResponse.json(
    plans.map((plan) => ({
      ...plan,
      phases: typeof plan.phases === "string" ? JSON.parse(plan.phases) : plan.phases,
    }))
  );
}
