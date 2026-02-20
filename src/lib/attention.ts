import * as schema from "@/db/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { AttentionType } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any; // Drizzle db instance type

interface CreateAttentionInput {
  projectId: string;
  planId?: string;
  type: AttentionType;
  title: string;
  detail?: string;
  priority: number;
  sourceUrl?: string;
}

export function createAttentionItem(db: Db, input: CreateAttentionInput) {
  // Check for existing active item of same type for same project (dedup)
  const existing = db
    .select()
    .from(schema.attentionItems)
    .where(
      and(
        eq(schema.attentionItems.projectId, input.projectId),
        eq(schema.attentionItems.type, input.type),
        isNull(schema.attentionItems.resolvedAt)
      )
    )
    .get();

  if (existing) {
    return existing;
  }

  const item = {
    id: uuid(),
    projectId: input.projectId,
    planId: input.planId ?? null,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    priority: input.priority,
    sourceUrl: input.sourceUrl ?? null,
    resolvedAt: null,
  };

  db.insert(schema.attentionItems).values(item).run();

  return db
    .select()
    .from(schema.attentionItems)
    .where(eq(schema.attentionItems.id, item.id))
    .get();
}

export function resolveAttentionItem(db: Db, itemId: string): void {
  db.update(schema.attentionItems)
    .set({ resolvedAt: new Date().toISOString() })
    .where(eq(schema.attentionItems.id, itemId))
    .run();
}

export function autoResolveByCondition(
  db: Db,
  projectId: string,
  type: AttentionType
): void {
  db.update(schema.attentionItems)
    .set({ resolvedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.attentionItems.projectId, projectId),
        eq(schema.attentionItems.type, type),
        isNull(schema.attentionItems.resolvedAt)
      )
    )
    .run();
}

export function getActiveItems(db: Db, projectId?: string) {
  const conditions = [isNull(schema.attentionItems.resolvedAt)];
  if (projectId) {
    conditions.push(eq(schema.attentionItems.projectId, projectId));
  }

  return db
    .select()
    .from(schema.attentionItems)
    .where(and(...conditions))
    .orderBy(desc(schema.attentionItems.priority), desc(schema.attentionItems.createdAt))
    .all();
}

export function getResolvedItems(db: Db, limit = 50) {
  return db
    .select()
    .from(schema.attentionItems)
    .where(isNotNull(schema.attentionItems.resolvedAt))
    .orderBy(desc(schema.attentionItems.resolvedAt))
    .limit(limit)
    .all();
}
