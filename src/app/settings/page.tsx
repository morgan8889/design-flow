"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  const [githubPat, setGithubPat] = useState("");
  const [syncInterval, setSyncInterval] = useState("180000");
  const [notifThreshold, setNotifThreshold] = useState("4");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.github_pat) setGithubPat(data.github_pat);
      if (data.sync_interval_ms) setSyncInterval(data.sync_interval_ms);
      if (data.notification_priority_threshold) setNotifThreshold(data.notification_priority_threshold);
    }
    load();
  }, []);

  const handleSave = async () => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        github_pat: githubPat,
        sync_interval_ms: syncInterval,
        notification_priority_threshold: notifThreshold,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <Card className="p-6 mb-6">
        <h3 className="font-medium mb-4">GitHub Connection</h3>
        <div className="space-y-2">
          <Label htmlFor="pat">Personal Access Token</Label>
          <Input
            id="pat"
            type="password"
            value={githubPat}
            onChange={(e) => setGithubPat(e.target.value)}
            placeholder="ghp_..."
          />
          <p className="text-xs text-muted-foreground">
            Requires <code>repo</code> scope for read access.
          </p>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="font-medium mb-4">Sync</h3>
        <div className="space-y-2">
          <Label htmlFor="interval">Sync interval (ms)</Label>
          <Input
            id="interval"
            type="number"
            value={syncInterval}
            onChange={(e) => setSyncInterval(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Default: 180000 (3 minutes)
          </p>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="font-medium mb-4">Notifications</h3>
        <div className="space-y-2">
          <Label htmlFor="threshold">Minimum priority for macOS notifications</Label>
          <Input
            id="threshold"
            type="number"
            min="1"
            max="5"
            value={notifThreshold}
            onChange={(e) => setNotifThreshold(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            1 = all items, 5 = critical only. Default: 4
          </p>
        </div>
      </Card>

      <Button onClick={handleSave}>
        {saved ? "Saved" : "Save settings"}
      </Button>
    </div>
  );
}
