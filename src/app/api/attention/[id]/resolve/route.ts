import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { resolveAttentionItem } from "@/lib/attention";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDatabase();

  const item = db.select().from(schema.attentionItems).where(eq(schema.attentionItems.id, id)).get();
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  resolveAttentionItem(db, id);
  return NextResponse.json({ resolved: true });
}
