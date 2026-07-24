"use client";

import { useEffect } from "react";

export function BirthdayMonitorSelectGuard() {
  useEffect(() => {
    function updateForm(form: HTMLFormElement) {
      const selects = Array.from(form.querySelectorAll<HTMLSelectElement>('select[name="monitorId"]'));
      const selectedValues = selects.map((select) => select.value).filter(Boolean);
      const ageGroup = form.querySelector<HTMLSelectElement>('select[name="ageGroup"]')?.value || "4_7";
      const childCount = Number(form.querySelector<HTMLInputElement>('input[name="childCount"]')?.value || 0);
      const childCountLabel = form.querySelector<HTMLElement>("[data-birthday-child-count-label]");
      const baseLimit = ageGroup === "8_plus" ? 30 : 20;
      const monitorCount = childCount > baseLimit ? 3 : 2;

      for (const select of selects) {
        for (const option of Array.from(select.options)) {
          option.disabled = Boolean(option.value && option.value !== select.value && selectedValues.includes(option.value));
        }
      }

      if (childCountLabel) {
        childCountLabel.textContent = `Crianças (${monitorCount} monitores necessários)`;
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
    document.addEventListener("input", updateAll);
    return () => {
      document.removeEventListener("change", updateAll);
      document.removeEventListener("input", updateAll);
    };
  }, []);

  return null;
}
