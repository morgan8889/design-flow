import { AttentionItemCard } from "@/components/inbox/attention-item-card";

interface ProjectActivityProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  onResolve: (id: string) => void;
}

export function ProjectActivity({ items, onResolve }: ProjectActivityProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No active items.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <AttentionItemCard key={item.id} item={item} onResolve={onResolve} />
      ))}
    </div>
  );
}
