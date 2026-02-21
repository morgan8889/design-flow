"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecList } from "@/components/projects/spec-list";
import { ProjectActivity } from "@/components/projects/project-activity";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [project, setProject] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plans, setPlans] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prs, setPrs] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [projRes, plansRes, prsRes, itemsRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/plans/${id}`),
        fetch(`/api/pull-requests?projectId=${id}`),
        fetch(`/api/attention?projectId=${id}`),
      ]);

      setProject(await projRes.json());
      setPlans(await plansRes.json());
      setPrs(await prsRes.json());
      setItems(await itemsRes.json());
      setLoading(false);
    }
    load();
  }, [id]);

  const handleResolve = async (itemId: string) => {
    await fetch(`/api/attention/${itemId}/resolve`, { method: "POST" });
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  if (loading || !project) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const statusLabel = items.some((i: { priority: number }) => i.priority >= 4)
    ? "Needs attention"
    : items.length > 0
      ? "On track"
      : "Clear";

  const statusVariant = items.some((i: { priority: number }) => i.priority >= 4)
    ? "destructive"
    : items.length > 0
      ? "default"
      : "secondary";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">{project.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Badge variant={statusVariant as any}>{statusLabel}</Badge>
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:underline"
              >
                GitHub
              </a>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetch("/api/sync", { method: "POST" })}>
          Sync
        </Button>
      </div>

      {/* Attention items */}
      {items.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Attention</h3>
          <ProjectActivity items={items} onResolve={handleResolve} />
        </div>
      )}

      {/* Spec list */}
      <SpecList plans={plans} pullRequests={prs} />
    </div>
  );
}
