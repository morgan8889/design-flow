import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { createProjectSchema } from "@/lib/validators";
import { v4 as uuid } from "uuid";

export async function GET() {
  const db = getDatabase();
  const projects = db.select().from(schema.projects).all();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDatabase();
  const project = {
    id: uuid(),
    name: parsed.data.name,
    githubUrl: parsed.data.githubUrl ?? null,
    localPath: parsed.data.localPath ?? null,
    source: parsed.data.source,
    isTracked: true,
  };

  db.insert(schema.projects).values(project).run();
  return NextResponse.json(project, { status: 201 });
}
