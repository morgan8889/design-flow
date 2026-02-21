"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type { SpecGroup, SpecStatus } from "./spec-row";

interface SpecDrawerProps {
  spec: SpecGroup | null;
  onClose: () => void;
}

const statusConfig: Record<SpecStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  shipped: { label: "Shipped", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  not_started: { label: "Not Started", variant: "outline" },
};

function PhaseSection({ phase }: { phase: { name: string; status: string; tasks: { text: string; done: boolean }[] } }) {
  const [open, setOpen] = useState(phase.status !== "completed");
  const done = phase.tasks.filter((t) => t.done).length;

  return (
    <div className="border rounded-md">
      <button
        className="w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="flex-1 font-medium truncate">{phase.name}</span>
        {phase.tasks.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{done}/{phase.tasks.length}</span>
        )}
      </button>
      {open && phase.tasks.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {phase.tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-0.5">
              <span className={`shrink-0 mt-0.5 ${task.done ? "text-primary" : "text-muted-foreground"}`}>
                {task.done ? "☑" : "☐"}
              </span>
              <span className={task.done ? "text-muted-foreground line-through" : ""}>{task.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecDrawer({ spec, onClose }: SpecDrawerProps) {
  if (!spec) return null;

  const primary = spec.primaryPlan;
  const totalTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.length, 0) ?? 0;
  const doneTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.filter((t) => t.done).length, 0) ?? 0;
  const config = statusConfig[spec.status];
  const supportingDocs = spec.plans.filter((p) => p.format !== "speckit-tasks");

  const sortedPhases = primary
    ? [...primary.phases].sort((a, b) => {
        const order = { in_progress: 0, not_started: 1, completed: 2 };
        return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
      })
    : [];

  return (
    <Sheet open={!!spec} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{spec.specNumber}</span>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <SheetTitle className="capitalize">{spec.specName}</SheetTitle>
          <p className="text-sm text-muted-foreground">{doneTasks} / {totalTasks} tasks complete</p>
        </SheetHeader>

        {/* PR link */}
        {spec.pr && (
          <div className="mb-4">
            <a
              href={spec.pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              PR #{spec.pr.number}: {spec.pr.title}
            </a>
          </div>
        )}

        {/* Phases */}
        <div className="space-y-2 mb-4">
          {sortedPhases.map((phase, i) => (
            <PhaseSection key={i} phase={phase} />
          ))}
        </div>

        {/* Supporting docs */}
        {supportingDocs.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Supporting docs</p>
            <div className="flex flex-wrap gap-1">
              {supportingDocs.map((doc) => (
                <span key={doc.id} className="text-xs bg-muted rounded px-1.5 py-0.5">
                  {doc.filePath.split("/").pop()}
                </span>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
