import notifier from "node-notifier";

interface NotifiableItem {
  priority: number;
}

interface FormattableItem {
  type: string;
  title: string;
  projectName: string;
}

export function shouldNotify(item: NotifiableItem, threshold: number): boolean {
  return item.priority >= threshold;
}

export function formatNotification(item: FormattableItem): { title: string; message: string } {
  return {
    title: `DesignFlow: ${item.projectName}`,
    message: item.title,
  };
}

export function sendMacNotification(title: string, message: string, url?: string): void {
  notifier.notify({
    title,
    message,
    sound: true,
    open: url,
  });
}
