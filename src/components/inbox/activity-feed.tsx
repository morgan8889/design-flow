"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";

interface ActivityItem {
  id: string;
  number: number;
  title: string;
  specNumber: string;
  mergedAt: string;
  htmlUrl: string;
  projectId: string;
  projectName: string;
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Recently shipped</h3>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 text-sm py-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <a
              href={item.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-mono text-xs text-muted-foreground shrink-0"
            >
              {item.specNumber}
            </a>
            <span className="truncate">{item.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">{item.projectName}</span>
            <span className="text-xs text-muted-foreground shrink-0">{item.mergedAt.slice(0, 10)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
