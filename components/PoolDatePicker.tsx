"use client";

import { useRouter } from "next/navigation";

export function PoolDatePicker({
  activeTab,
  basePath,
  selectedDateValue
}: {
  activeTab: string;
  basePath: string;
  selectedDateValue: string;
}) {
  const router = useRouter();

  function handleDateChange(value: string) {
    if (!value) {
      return;
    }

    router.replace(`${basePath}?date=${encodeURIComponent(value)}&tab=${encodeURIComponent(activeTab)}`);
  }

  return (
    <label className="field" htmlFor="date">
      <span>Data</span>
      <input id="date" name="date" type="date" defaultValue={selectedDateValue} onChange={(event) => handleDateChange(event.target.value)} />
    </label>
  );
}
