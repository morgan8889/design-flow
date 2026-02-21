"use client";

import { useEffect, useState } from "react";
import { ProjectCard } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Project {
  id: string;
  name: string;
  githubUrl: string | null;
  localPath: string | null;
  source: string;
  isTracked: boolean;
  lastSyncedAt: string | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);
      setLoading(false);
    }
    load();
  }, []);

  async function enableTracking(id: string) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTracked: true }),
    });
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isTracked: true } : p))
    );
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const tracked = projects.filter((p) => p.isTracked);
  const untracked = projects.filter((p) => !p.isTracked);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Projects</h2>

      {tracked.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Tracked</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tracked.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {untracked.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Available</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {untracked.map((project) => (
              <Card key={project.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{project.name}</p>
                  {project.githubUrl && (
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {project.githubUrl}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => enableTracking(project.id)}>
                  Track
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <p className="text-muted-foreground mt-8 text-center">
          No projects yet. Configure your GitHub PAT in Settings to discover repos.
        </p>
      )}
    </div>
  );
}
