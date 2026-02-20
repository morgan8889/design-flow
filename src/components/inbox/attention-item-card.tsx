"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AttentionItemProps {
  item: {
    id: string;
    type: string;
    title: string;
    detail: string | null;
    priority: number;
    sourceUrl: string | null;
    projectName?: string;
    createdAt: string;
  };
  onResolve: (id: string) => void;
}

const priorityColors: Record<number, string> = {
  5: "bg-red-500",
  4: "bg-orange-500",
  3: "bg-yellow-500",
  2: "bg-blue-500",
  1: "bg-gray-400",
};

const typeLabels: Record<string, string> = {
  pr_needs_review: "PR Review",
  checks_failing: "Checks Failing",
  pr_merge_ready: "Merge Ready",
  plan_changed: "Plan Changed",
  phase_blocked: "Phase Blocked",
  new_project: "New Project",
  stale_project: "Stale",
};

export function AttentionItemCard({ item, onResolve }: AttentionItemProps) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className={`w-2 h-2 rounded-full mt-2 ${priorityColors[item.priority] ?? "bg-gray-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {typeLabels[item.type] ?? item.type}
          </Badge>
          {item.projectName && (
            <span className="text-xs text-muted-foreground">{item.projectName}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.detail && (
          <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {item.sourceUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onResolve(item.id)}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
