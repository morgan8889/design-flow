"use client";

import { Button } from "@/components/ui/button";

const filterOptions = [
  { value: undefined, label: "All" },
  { value: "pr_needs_review", label: "PR Reviews" },
  { value: "checks_failing", label: "Failing Checks" },
  { value: "pr_merge_ready", label: "Merge Ready" },
  { value: "plan_changed", label: "Plan Changes" },
];

interface InboxFiltersProps {
  activeFilter?: string;
  onFilterChange: (filter?: string) => void;
}

export function InboxFilters({ activeFilter, onFilterChange }: InboxFiltersProps) {
  return (
    <div className="flex gap-2 mb-4">
      {filterOptions.map((option) => (
        <Button
          key={option.label}
          variant={activeFilter === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
