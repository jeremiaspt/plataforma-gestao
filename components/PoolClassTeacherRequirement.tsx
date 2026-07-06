"use client";

import { useEffect } from "react";

export function PoolClassTeacherRequirement() {
  useEffect(() => {
    const typeSelect = document.getElementById("type") as HTMLSelectElement | null;
    const teacherSelect = document.getElementById("teacherId") as HTMLSelectElement | null;

    if (!typeSelect || !teacherSelect) {
      return;
    }

    const updateRequirement = () => {
      teacherSelect.required = typeSelect.value === "aula";
    };

    updateRequirement();
    typeSelect.addEventListener("change", updateRequirement);

    return () => typeSelect.removeEventListener("change", updateRequirement);
  }, []);

  return null;
}
