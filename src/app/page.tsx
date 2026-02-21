"use client";

import { useEffect, useState, useCallback } from "react";
import { AttentionItemCard } from "@/components/inbox/attention-item-card";
import { InboxFilters } from "@/components/inbox/inbox-filters";

interface AttentionItem {
  id: string;
  projectId: string;
  type: string;
  title: string;
  detail: string | null;
  priority: number;
  sourceUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function InboxPage() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [filter, setFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter) params.set("type", filter);

    const res = await fetch(`/api/attention?${params}`);
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleResolve = async (id: string) => {
    await fetch(`/api/attention/${id}/resolve`, { method: "POST" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Inbox</h2>
      <InboxFilters activeFilter={filter} onFilterChange={setFilter} />

      {items.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-center">
          Nothing needs your attention right now.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <AttentionItemCard key={item.id} item={item} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </div>
  );
}
