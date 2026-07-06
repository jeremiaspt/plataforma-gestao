"use client";

import { useMemo, useState } from "react";

type PaymentTypeOption = {
  id: string;
  label: string;
  requiredParticipants: number;
};

type StudentOption = {
  id: string;
  label: string;
};

type Props = {
  teacherId: string;
  paymentTypes: PaymentTypeOption[];
  students: StudentOption[];
};

export function PaymentLaunchForm({ teacherId, paymentTypes, students }: Props) {
  const [paymentTypeId, setPaymentTypeId] = useState(paymentTypes[0]?.id || "");
  const [selectedStudents, setSelectedStudents] = useState(["", "", ""]);
  const selectedType = useMemo(
    () => paymentTypes.find((type) => type.id === paymentTypeId),
    [paymentTypeId, paymentTypes]
  );
  const requiredParticipants = selectedType?.requiredParticipants || 1;

  function updateSelectedStudent(index: number, value: string) {
    setSelectedStudents((current) => current.map((studentId, studentIndex) => (studentIndex === index ? value : studentId)));
  }

  return (
    <form className="payment-launch-form stacked" action="/api/personal-training/payments" method="post">
      <input type="hidden" name="teacherId" value={teacherId} />

      <div className="payment-main-fields">
        <div className="field wide">
          <label htmlFor="paymentTypeId">Tipo de aula</label>
          <select id="paymentTypeId" name="paymentTypeId" required value={paymentTypeId} onChange={(event) => setPaymentTypeId(event.target.value)}>
            {paymentTypes.map((type) => (
              <option value={type.id} key={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quantity">Quantidade</label>
          <input id="quantity" name="quantity" type="number" min="1" step="1" defaultValue="1" required />
        </div>
      </div>

      <div className="participant-grid">
        {[0, 1, 2].map((index) => {
          const isRequired = index < requiredParticipants;
          const selectedStudentId = selectedStudents[index];

          return (
            <fieldset className={isRequired ? "participant-card required" : "participant-card"} key={index} disabled={!isRequired}>
              <legend>Utente {index + 1}</legend>
              <div className="field">
                <label htmlFor={`existingStudentId-${index}`}>Aluno do professor</label>
                <select
                  id={`existingStudentId-${index}`}
                  name="existingStudentId"
                  value={selectedStudentId}
                  onChange={(event) => updateSelectedStudent(index, event.target.value)}
                >
                  <option value="">Adicionar novo aluno</option>
                  {students.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`memberNumber-${index}`}>N.º utente</label>
                <input id={`memberNumber-${index}`} name="memberNumber" required={isRequired && !selectedStudentId} />
              </div>
              <div className="field">
                <label htmlFor={`fullName-${index}`}>Nome completo</label>
                <input id={`fullName-${index}`} name="fullName" required={isRequired && !selectedStudentId} />
              </div>
            </fieldset>
          );
        })}
      </div>

      <button className="button" type="submit" disabled={!teacherId || paymentTypes.length === 0}>
        Lançar pagamento
      </button>
    </form>
  );
}
