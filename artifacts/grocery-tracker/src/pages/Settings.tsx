import { Settings as SettingsIcon } from "lucide-react";
import { SchedulerSettings } from "@/components/SchedulerSettings";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 sm:px-6">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-foreground">
          <SettingsIcon className="h-8 w-8 text-primary" />
          Settings
        </h1>
        <p className="mt-2 text-muted-foreground">Manage automatic price tracking and background request pacing.</p>
      </div>
      <SchedulerSettings />
    </div>
  );
}
