import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const db = getDatabase();
  const rows = db.select().from(schema.settings).all();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getDatabase();

  for (const [key, value] of Object.entries(body)) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (existing) {
      db.update(schema.settings).set({ value: String(value) }).where(eq(schema.settings.key, key)).run();
    } else {
      db.insert(schema.settings).values({ key, value: String(value) }).run();
    }
  }

  return NextResponse.json({ updated: true });
}
