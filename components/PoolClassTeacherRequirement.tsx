"use client";

import { useEffect } from "react";

export function PoolClassTeacherRequirement() {
  useEffect(() => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("[data-pool-schedule-form]"));

    if (forms.length === 0) {
      return;
    }

    const cleanups = forms
      .map((form) => {
        const typeSelect = form.elements.namedItem("type") as HTMLSelectElement | null;
        const teacherSelect = form.elements.namedItem("teacherId") as HTMLSelectElement | null;

        if (!typeSelect || !teacherSelect) {
          return null;
        }

        const updateRequirement = () => {
          teacherSelect.required = typeSelect.value === "aula";
        };

        updateRequirement();
        typeSelect.addEventListener("change", updateRequirement);

        return () => typeSelect.removeEventListener("change", updateRequirement);
      })
      .filter(Boolean);

    return () => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
    };
  }, []);

  return null;
}
