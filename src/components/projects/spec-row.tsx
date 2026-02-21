"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface PlanPhase {
  name: string;
  status: string;
  tasks: { text: string; done: boolean }[];
}

export interface Plan {
  id: string;
  title: string;
  format: string;
  filePath: string;
  phases: PlanPhase[];
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  branchRef: string;
  specNumber: string | null;
  state: string;
  mergedAt: string | null;
  htmlUrl: string;
}

export type SpecStatus = "shipped" | "in_progress" | "not_started";

export interface SpecGroup {
  specNumber: string;
  specName: string;
  plans: Plan[];
  primaryPlan: Plan | null;
  status: SpecStatus;
  mergedAt: string | null;
  pr: PullRequest | null;
}

interface SpecRowProps {
  spec: SpecGroup;
  defaultExpanded?: boolean;
  onOpenDrawer?: (spec: SpecGroup) => void;
}

const statusConfig: Record<SpecStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  shipped: { label: "Shipped", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  not_started: { label: "Not Started", variant: "outline" },
};

export function SpecRow({ spec, defaultExpanded = false, onOpenDrawer }: SpecRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const primary = spec.primaryPlan;
  const totalTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.length, 0) ?? 0;
  const doneTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.filter((t) => t.done).length, 0) ?? 0;
  const pct = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;

  const config = statusConfig[spec.status];
  const isShipped = spec.status === "shipped";

  const supportingDocs = spec.plans.filter((p) => p.format !== "speckit-tasks");

  return (
    <div className={`border rounded-md ${isShipped ? "opacity-60" : ""}`}>
      {/* Collapsed header — always visible */}
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">{spec.specNumber}</span>
        <span className="font-medium capitalize flex-1 truncate">{spec.specName}</span>
        <Badge variant={config.variant} className="text-xs shrink-0">{config.label}</Badge>
        {totalTasks > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{doneTasks}/{totalTasks}</span>
        )}
        {isShipped && spec.mergedAt && (
          <span className="text-xs text-muted-foreground shrink-0">{spec.mergedAt.slice(0, 10)}</span>
        )}
      </button>

      {/* Progress bar — always visible */}
      {totalTasks > 0 && (
        <div className="mx-3 mb-2 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          {/* Phases from primary plan */}
          {primary && (
            <div className="space-y-1">
              {[...primary.phases]
                .sort((a, b) => {
                  const order = { in_progress: 0, not_started: 1, completed: 2 };
                  return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
                })
                .map((phase, i) => {
                  const done = phase.tasks.filter((t) => t.done).length;
                  return (
                    <div key={i} className={`text-sm flex items-center justify-between ${phase.status === "completed" ? "text-muted-foreground" : ""}`}>
                      <span className="truncate">{phase.name}</span>
                      {phase.tasks.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{done}/{phase.tasks.length}</span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* PR link */}
          {spec.pr && (
            <a
              href={spec.pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              PR #{spec.pr.number}: {spec.pr.title.slice(0, 50)}
            </a>
          )}

          {/* Supporting docs */}
          {supportingDocs.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {supportingDocs.map((doc) => (
                <span key={doc.id} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                  {doc.filePath.split("/").pop()}
                </span>
              ))}
            </div>
          )}

          {/* Open drawer button */}
          {onOpenDrawer && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); onOpenDrawer(spec); }}>
              View all tasks →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
