"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpecRow, type Plan, type PullRequest, type SpecGroup, type SpecStatus } from "./spec-row";
import { SpecDrawer } from "./spec-drawer";

interface SpecListProps {
  plans: Plan[];
  pullRequests: PullRequest[];
}

function parseSpecKey(filePath: string): { specNumber: string; specName: string } | null {
  const m = filePath.match(/^specs\/(\d{3})-([^/]+)\//);
  if (!m) return null;
  return { specNumber: m[1], specName: m[2].replace(/-/g, " ") };
}

function extractPlanSlug(filePath: string): string {
  const filename = filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
  const withoutDate = filename.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return withoutDate.replace(/-(implementation|design|plan|spec)$/, "");
}

function extractBranchSlug(branchRef: string): string {
  const withoutPrefix = branchRef.replace(/^[^/]+\//, "");
  return withoutPrefix.replace(/-(implementation|design|plan|spec)$/, "");
}

function deriveStatus(spec: { plans: Plan[]; specNumber: string }, prs: PullRequest[]): SpecStatus {
  const specPrs = prs.filter((pr) => pr.specNumber === spec.specNumber);
  if (specPrs.some((pr) => pr.state === "merged")) return "shipped";
  const hasOpenPr = specPrs.some((pr) => pr.state === "open");
  const hasDoneTasks = spec.plans.some((p) =>
    p.phases.some((ph) => ph.tasks.some((t) => t.done))
  );
  const hasInProgressPhase = spec.plans.some((p) =>
    p.phases.some((ph) => ph.status === "in_progress" || ph.status === "completed")
  );
  if (hasOpenPr || hasDoneTasks || hasInProgressPhase) return "in_progress";
  return "not_started";
}

function planToSpecGroup(plan: Plan, pullRequests: PullRequest[]): SpecGroup {
  const planSlug = extractPlanSlug(plan.filePath);
  const matchingPrs = planSlug
    ? pullRequests.filter((pr) => pr.branchRef && extractBranchSlug(pr.branchRef) === planSlug)
    : [];
  const mergedPr = matchingPrs.find((pr) => pr.state === "merged") ?? null;
  const openPr = matchingPrs.find((pr) => pr.state === "open") ?? null;
  const hasProgress = plan.phases.some(
    (ph) => ph.status === "in_progress" || ph.status === "completed" || ph.tasks.some((t) => t.done)
  );
  const status: SpecStatus = mergedPr ? "shipped" : openPr || hasProgress ? "in_progress" : "not_started";
  return {
    specNumber: "",
    specName: plan.title,
    plans: [plan],
    primaryPlan: plan,
    status,
    mergedAt: mergedPr?.mergedAt ?? null,
    pr: mergedPr ?? openPr,
  };
}

function buildSpecGroups(plans: Plan[], pullRequests: PullRequest[]): { specs: SpecGroup[]; ungrouped: Plan[] } {
  const groupMap = new Map<string, { specNumber: string; specName: string; plans: Plan[] }>();
  const ungrouped: Plan[] = [];

  for (const plan of plans) {
    const parsed = parseSpecKey(plan.filePath);
    if (parsed) {
      const existing = groupMap.get(parsed.specNumber);
      if (existing) {
        existing.plans.push(plan);
      } else {
        groupMap.set(parsed.specNumber, { ...parsed, plans: [plan] });
      }
    } else {
      ungrouped.push(plan);
    }
  }

  const specs: SpecGroup[] = Array.from(groupMap.values())
    .sort((a, b) => a.specNumber.localeCompare(b.specNumber))
    .map((group) => {
      const primaryPlan =
        group.plans.find((p) => p.format === "speckit-tasks" && p.filePath.endsWith("/tasks.md")) ??
        group.plans.find((p) => p.format === "speckit-tasks") ??
        group.plans.find((p) => p.phases.length > 0) ??
        null;
      const status = deriveStatus(group, pullRequests);
      const specPrs = pullRequests.filter((pr) => pr.specNumber === group.specNumber);
      const mergedPr = specPrs.find((pr) => pr.state === "merged") ?? null;
      const openPr = specPrs.find((pr) => pr.state === "open") ?? null;
      return {
        specNumber: group.specNumber,
        specName: group.specName,
        plans: group.plans,
        primaryPlan,
        status,
        mergedAt: mergedPr?.mergedAt ?? null,
        pr: mergedPr ?? openPr,
      };
    });

  return { specs, ungrouped };
}

export function SpecList({ plans, pullRequests }: SpecListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "shipped">("all");
  const [showAllShipped, setShowAllShipped] = useState(false);
  const [drawerSpec, setDrawerSpec] = useState<SpecGroup | null>(null);

  const { specs, ungrouped } = useMemo(
    () => buildSpecGroups(plans, pullRequests),
    [plans, pullRequests]
  );

  const ungroupedGroups = useMemo(
    () => ungrouped.map((p) => planToSpecGroup(p, pullRequests)),
    [ungrouped, pullRequests]
  );

  const allGroups = [...specs, ...ungroupedGroups];
  const shipped = allGroups.filter((s) => s.status === "shipped");
  const inProgress = allGroups.filter((s) => s.status === "in_progress");
  const notStarted = allGroups.filter((s) => s.status === "not_started");

  const stats = `${shipped.length} shipped · ${inProgress.length} in progress · ${notStarted.length} not started`;

  const filterSpec = (s: SpecGroup) => {
    if (search && !s.specName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "in_progress" && s.status !== "in_progress") return false;
    if (statusFilter === "shipped" && s.status !== "shipped") return false;
    return true;
  };

  const visibleShipped = showAllShipped ? shipped.filter(filterSpec) : [];


  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{stats}</p>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search specs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {(["all", "in_progress", "shipped"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              onClick={() => setStatusFilter(f)}
            >
              {f === "all" ? "All" : f === "in_progress" ? "In Progress" : "Shipped"}
            </Button>
          ))}
        </div>
      </div>

      {/* In Progress */}
      {inProgress.filter(filterSpec).length > 0 && statusFilter !== "shipped" && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">In Progress</h4>
          <div className="space-y-2">
            {inProgress.filter(filterSpec).map((spec) => (
              <SpecRow key={spec.specNumber || spec.plans[0]?.id} spec={spec} defaultExpanded onOpenDrawer={setDrawerSpec} />
            ))}
          </div>
        </div>
      )}

      {/* Not Started */}
      {notStarted.filter(filterSpec).length > 0 && statusFilter === "all" && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Not Started</h4>
          <div className="space-y-2">
            {notStarted.filter(filterSpec).map((spec) => (
              <SpecRow key={spec.specNumber || spec.plans[0]?.id} spec={spec} onOpenDrawer={setDrawerSpec} />
            ))}
          </div>
        </div>
      )}

      {/* Shipped */}
      {shipped.length > 0 && statusFilter !== "in_progress" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Shipped ({shipped.length})
            </h4>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAllShipped((s) => !s)}>
              {showAllShipped ? "Collapse" : "Show all"}
            </Button>
          </div>
          {showAllShipped && (
            <div className="space-y-2">
              {visibleShipped.map((spec) => (
                <SpecRow key={spec.specNumber || spec.plans[0]?.id} spec={spec} onOpenDrawer={setDrawerSpec} />
              ))}
            </div>
          )}
        </div>
      )}

      <SpecDrawer spec={drawerSpec} onClose={() => setDrawerSpec(null)} />
    </div>
  );
}
