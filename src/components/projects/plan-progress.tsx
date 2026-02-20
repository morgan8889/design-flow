interface PlanPhase {
  name: string;
  status: string;
  tasks: { text: string; done: boolean }[];
}

interface Plan {
  id: string;
  title: string;
  format: string;
  phases: PlanPhase[];
}

interface PlanProgressProps {
  plans: Plan[];
}

export function PlanProgress({ plans }: PlanProgressProps) {
  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">No plans found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {plans.map((plan) => (
        <div key={plan.id}>
          <h4 className="font-medium mb-3">{plan.title}</h4>
          <div className="flex flex-col gap-2">
            {plan.phases.map((phase, idx) => {
              const total = phase.tasks.length;
              const done = phase.tasks.filter((t) => t.done).length;
              const isCurrent = phase.status === "in_progress";

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-md border text-sm ${
                    isCurrent ? "border-primary bg-primary/5" : ""
                  } ${phase.status === "completed" ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={isCurrent ? "font-medium" : ""}>{phase.name}</span>
                    {total > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {done}/{total}
                      </span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(done / total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
