"use client";

import { Button } from "@/components/ui/button";

export function Header() {
  const handleSync = async () => {
    await fetch("/api/sync", { method: "POST" });
  };

  return (
    <header className="h-14 border-b px-6 flex items-center justify-between">
      <div />
      <Button variant="outline" size="sm" onClick={handleSync}>
        Sync now
      </Button>
    </header>
  );
}
