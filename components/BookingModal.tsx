"use client";

import { useMemo, useState } from "react";
import { requiredParticipantsForType, trainingDurationOptions } from "@/lib/personalTrainingRules";

type TrainingTypeOption = {
  key: string;
  name: string;
  durationMinutes: number;
};

type CreditBalanceOption = {
  studentId: string;
  fullName: string;
  memberNumber: string;
  trainingTypeKey: string;
  availableCredits: number;
  canBook: boolean;
};

export function BookingModal({
  date,
  poolBlockId,
  blockTitle,
  laneNumber,
  startLabel,
  endLabel,
  blockStartMinutes,
  blockEndMinutes,
  maxDurationMinutes,
  closeHref,
  trainingTypes,
  creditBalances,
  editBooking
}: {
  date: string;
  poolBlockId: string;
  blockTitle: string;
  laneNumber: number;
  startLabel: string;
  endLabel: string;
  blockStartMinutes: number;
  blockEndMinutes: number;
  maxDurationMinutes: number;
  closeHref: string;
  trainingTypes: TrainingTypeOption[];
  creditBalances: CreditBalanceOption[];
  editBooking?: {
    groupId: string;
    startMinutes: number;
    durationMinutes: number;
    trainingTypeKey: string;
    studentIds: string[];
  };
}) {
  const availableDurations = trainingDurationOptions.filter((duration) => duration <= maxDurationMinutes);
  const [durationMinutes, setDurationMinutes] = useState(editBooking?.durationMinutes || availableDurations[0] || 30);
  const filteredTypes = useMemo(
    () => trainingTypes.filter((type) => type.durationMinutes === durationMinutes),
    [durationMinutes, trainingTypes]
  );
  const [trainingTypeKey, setTrainingTypeKey] = useState(editBooking?.trainingTypeKey || filteredTypes[0]?.key || "");
  const [selectedStudentIds, setSelectedStudentIds] = useState(editBooking?.studentIds || []);
  const selectedType = filteredTypes.find((type) => type.key === trainingTypeKey) || filteredTypes[0];
  const selectedTypeKey = selectedType?.key || "";
  const requiredParticipants = requiredParticipantsForType(selectedType?.name);
  const eligibleBalances = creditBalances.filter(
    (balance) =>
      balance.trainingTypeKey === selectedTypeKey &&
      (balance.canBook || Boolean(editBooking?.studentIds.includes(balance.studentId)))
  );
  const startOptions = useMemo(() => {
    const options: number[] = [];
    const latestStart = blockEndMinutes - durationMinutes;

    for (let minutes = blockStartMinutes; minutes <= latestStart; minutes += 5) {
      options.push(minutes);
    }

    return options;
  }, [blockEndMinutes, blockStartMinutes, durationMinutes]);
  const [startMinutes, setStartMinutes] = useState(editBooking?.startMinutes || startOptions[0] || blockStartMinutes);

  function handleDurationChange(value: string) {
    const nextDuration = Number(value);
    const nextTypes = trainingTypes.filter((type) => type.durationMinutes === nextDuration);
    setDurationMinutes(nextDuration);
    setTrainingTypeKey(nextTypes[0]?.key || "");
    setStartMinutes(blockStartMinutes);
    setSelectedStudentIds([]);
  }

  function handleTrainingTypeChange(value: string) {
    setTrainingTypeKey(value);
    setSelectedStudentIds([]);
  }

  function handleStudentChange(index: number, value: string) {
    setSelectedStudentIds((current) => {
      const next = [...current];
      next[index] = value;
      return next.slice(0, requiredParticipants);
    });
  }

  function formatMinutes(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  return (
    <div className="modal-backdrop">
      <section className="booking-modal">
        <div className="topbar">
          <div>
            <p className="eyebrow">Marcação PT</p>
            <h1>
              {blockTitle} · Pista {laneNumber}
            </h1>
            <p className="muted">
              {startLabel} - {endLabel}
            </p>
          </div>
          <a className="button secondary" href={closeHref}>
            Fechar
          </a>
        </div>

        <form className="booking-popup-form" action="/api/personal-training/bookings" method="post">
          {editBooking ? <input type="hidden" name="bookingGroupId" value={editBooking.groupId} /> : null}
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="poolBlockId" value={poolBlockId} />
          <input type="hidden" name="durationMinutes" value={durationMinutes} />
          <input type="hidden" name="trainingTypeKey" value={selectedTypeKey} />
          <input type="hidden" name="startMinutes" value={startMinutes} />

          <div className="field">
            <label>Duração</label>
            <select value={durationMinutes} onChange={(event) => handleDurationChange(event.target.value)}>
              {availableDurations.map((duration) => (
                <option value={duration} key={duration}>
                  {duration} min
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Início</label>
            <select value={startMinutes} onChange={(event) => setStartMinutes(Number(event.target.value))}>
              {startOptions.map((minutes) => (
                <option value={minutes} key={minutes}>
                  {formatMinutes(minutes)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Tipo de aula</label>
            <select value={selectedTypeKey} onChange={(event) => handleTrainingTypeChange(event.target.value)} required>
              {filteredTypes.map((type) => (
                <option value={type.key} key={type.key}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {Array.from({ length: requiredParticipants }).map((_, index) => (
            <div className="field" key={index}>
              <label>Utente {index + 1}</label>
              <select
                name="studentIds"
                value={selectedStudentIds[index] || ""}
                onChange={(event) => handleStudentChange(index, event.target.value)}
                required
              >
                <option value="">Selecionar utente</option>
                {eligibleBalances
                  .filter(
                    (balance) =>
                      !selectedStudentIds.some((studentId, studentIndex) => studentIndex !== index && studentId === balance.studentId)
                  )
                  .map((balance) => (
                    <option value={balance.studentId} key={balance.studentId}>
                      {balance.fullName} · saldo {balance.availableCredits}
                    </option>
                  ))}
              </select>
            </div>
          ))}

          <button className="button" type="submit" disabled={!selectedTypeKey || eligibleBalances.length < requiredParticipants}>
            {editBooking ? "Guardar alteração" : "Marcar aula"}
          </button>
        </form>
      </section>
    </div>
  );
}
