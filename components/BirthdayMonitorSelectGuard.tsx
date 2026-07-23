"use client";

import { useEffect } from "react";

export function BirthdayMonitorSelectGuard() {
  useEffect(() => {
    function updateForm(form: HTMLFormElement) {
      const selects = Array.from(form.querySelectorAll<HTMLSelectElement>('select[name="monitorId"]'));
      const selectedValues = selects.map((select) => select.value).filter(Boolean);

      for (const select of selects) {
        for (const option of Array.from(select.options)) {
          option.disabled = Boolean(option.value && option.value !== select.value && selectedValues.includes(option.value));
        }
      }
    }

    function updateAll() {
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
      for (const form of forms) {
        if (form.querySelector('select[name="monitorId"]')) {
          updateForm(form);
        }
      }
    }

    updateAll();
    document.addEventListener("change", updateAll);
    return () => document.removeEventListener("change", updateAll);
  }, []);

  return null;
}
