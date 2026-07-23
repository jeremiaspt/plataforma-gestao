"use client";

import { useMemo, useState } from "react";

type StudentPaymentRow = {
  canCancel: boolean;
  cancelledByName: string | null;
  createdAtLabel: string;
  createdByName: string;
  id: string;
  isCancelled: boolean;
  paymentTypeDescription: string;
  quantity: number;
  studentFullName: string;
  studentMemberNumber: string;
  teacherId: string;
  teacherName: string;
  teacherTotalLabel: string;
  totalCredits: number;
  totalPriceLabel: string;
};

type Props = {
  canCancelPayments: boolean;
  isAdmin: boolean;
  month: string;
  payments: StudentPaymentRow[];
  showTeacherColumn: boolean;
};

function matchesSearch(payment: StudentPaymentRow, search: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt");

  if (!normalizedSearch) {
    return true;
  }

  return (
    payment.studentFullName.toLocaleLowerCase("pt").includes(normalizedSearch) ||
    payment.studentMemberNumber.toLocaleLowerCase("pt").includes(normalizedSearch)
  );
}

export function PersonalTrainingStudentPaymentsSearch({ canCancelPayments, isAdmin, month, payments, showTeacherColumn }: Props) {
  const [search, setSearch] = useState("");
  const filteredPayments = useMemo(() => payments.filter((payment) => matchesSearch(payment, search)), [payments, search]);

  return (
    <div className="tab-content">
      <div className="live-search-row">
        <div className="field wide">
          <label htmlFor="studentSearch">Pesquisar utente</label>
          <input
            id="studentSearch"
            placeholder="N. utente ou nome"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="status active">{filteredPayments.length} pagamentos</span>
      </div>

      <div className="payments-table">
        <div className={`${showTeacherColumn ? "payments-header" : "payments-header teacher-values"} ${canCancelPayments ? "with-actions" : ""}`}>
          <span>Data</span>
          {showTeacherColumn ? <span>Professor</span> : null}
          <span>Utente</span>
          <span>Lancado por</span>
          <span>Tipo</span>
          <span>Qtd./Cred.</span>
          <span>Valores</span>
          <span>Estado</span>
          {canCancelPayments ? <span>Acao</span> : null}
        </div>
        {filteredPayments.length === 0 ? <p className="muted">Sem pagamentos compativeis com a pesquisa.</p> : null}
        {filteredPayments.map((payment) => (
          <div
            className={`${showTeacherColumn ? "payments-row" : "payments-row teacher-values"} ${canCancelPayments ? "with-actions" : ""} ${
              payment.isCancelled ? "cancelled-payment" : ""
            }`}
            key={payment.id}
          >
            <span>{payment.createdAtLabel}</span>
            {showTeacherColumn ? <span>{payment.teacherName}</span> : null}
            <span>
              {payment.studentFullName}
              <small>{payment.studentMemberNumber}</small>
            </span>
            <span>{payment.createdByName}</span>
            <span>{payment.paymentTypeDescription}</span>
            <span>
              {payment.quantity} qtd.
              <small>{payment.totalCredits} creditos</small>
            </span>
            <span>
              {payment.teacherTotalLabel}
              {isAdmin ? <small>{payment.totalPriceLabel} utente</small> : null}
            </span>
            <span className="payment-status-cell">
              <span className={payment.isCancelled ? "status inactive" : "status active"}>
                {payment.isCancelled ? "Anulado" : "Ativo"}
              </span>
              {payment.isCancelled && payment.cancelledByName ? <small>por {payment.cancelledByName}</small> : null}
            </span>
            {canCancelPayments ? (
              <span>
                {payment.canCancel ? (
                  <form className="payment-cancel-form" action="/api/personal-training/payments/cancel" method="post">
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <input type="hidden" name="teacherId" value={payment.teacherId} />
                    <input type="hidden" name="month" value={month} />
                    <input name="reason" placeholder="Motivo" />
                    <button className="button danger" type="submit">
                      Anular
                    </button>
                  </form>
                ) : (
                  <small className="muted">Sem permissao</small>
                )}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
