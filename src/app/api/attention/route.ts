import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getActiveItems } from "@/lib/attention";
import { attentionFilterSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filters = attentionFilterSchema.safeParse({
    type: searchParams.get("type") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    resolved: searchParams.has("resolved") ? searchParams.get("resolved") === "true" : undefined,
  });

  if (!filters.success) {
    return NextResponse.json({ error: filters.error.flatten() }, { status: 400 });
  }

  const db = getDatabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items = getActiveItems(db, filters.data.projectId);

  if (filters.data.type) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items = items.filter((item: any) => item.type === filters.data.type);
  }

  return NextResponse.json(items);
}
