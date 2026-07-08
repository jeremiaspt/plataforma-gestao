"use client";

import { useRef } from "react";

export function TeacherAutoSubmitFilter({
  teachers,
  selectedTeacherId,
  activeTab,
  selectedMonth,
  selectedGlobalMonth
}: {
  teachers: { id: string; name: string }[];
  selectedTeacherId: string;
  activeTab: string;
  selectedMonth: string;
  selectedGlobalMonth: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} className="teacher-filter compact-teacher-filter" method="get" action="/treinos-personalizados/pagamentos">
      <input type="hidden" name="tab" value={activeTab} />
      <input type="hidden" name="month" value={selectedMonth} />
      <input type="hidden" name="globalMonth" value={selectedGlobalMonth} />
      <div className="field">
        <label htmlFor="teacherId">Professor</label>
        <select id="teacherId" name="teacherId" defaultValue={selectedTeacherId} onChange={() => formRef.current?.requestSubmit()}>
          {teachers.map((teacher) => (
            <option value={teacher.id} key={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
