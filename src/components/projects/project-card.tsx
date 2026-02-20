import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    isTracked: boolean;
    lastSyncedAt: string | null;
    attentionCount?: number;
    currentPhase?: string;
    status?: "needs_attention" | "on_track" | "stale";
  };
}

const statusConfig = {
  needs_attention: { label: "Needs attention", variant: "destructive" as const },
  on_track: { label: "On track", variant: "default" as const },
  stale: { label: "Stale", variant: "secondary" as const },
};

export function ProjectCard({ project }: ProjectCardProps) {
  const status = project.status ?? "on_track";
  const config = statusConfig[status];

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium">{project.name}</h3>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        {project.currentPhase && (
          <p className="text-sm text-muted-foreground mb-1">{project.currentPhase}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {project.attentionCount !== undefined && project.attentionCount > 0 && (
            <span>{project.attentionCount} item{project.attentionCount !== 1 ? "s" : ""}</span>
          )}
          {project.lastSyncedAt && (
            <span>Synced {new Date(project.lastSyncedAt).toLocaleDateString()}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
