import { useState } from "react";
import { CRON_PRESETS } from "../../hooks/useScheduledTasks";

interface CronPickerProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronPicker({ value, onChange }: CronPickerProps): JSX.Element {
  const [isCustom, setIsCustom] = useState(
    !CRON_PRESETS.some((p) => p.value === value),
  );

  return (
    <div className="flex flex-col gap-2">
      <select
        value={isCustom ? "" : value}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
            setIsCustom(false);
          }
        }}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--accent)] focus:outline-none"
      >
        <option value="">选择预设...</option>
        {CRON_PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
        <option value="custom">自定义...</option>
      </select>

      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="* * * * *"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text-1)] focus:border-[var(--accent)] focus:outline-none"
        />
      )}

      {value && (
        <p className="text-xs text-[var(--text-3)]">
          <span className="rounded bg-[var(--surface)] px-2 py-1 font-mono">
            {value}
          </span>
        </p>
      )}
    </div>
  );
}
