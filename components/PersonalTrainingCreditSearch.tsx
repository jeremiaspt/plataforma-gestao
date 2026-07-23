"use client";

import { useMemo, useState } from "react";

type CreditBalanceRow = {
  adjustedCredits: number;
  availableCredits: number;
  canBook: boolean;
  fullName: string;
  memberNumber: string;
  purchasedCredits: number;
  studentId: string;
  trainingTypeKey: string;
  trainingTypeName: string;
  usedCredits: number;
};

type Props = {
  balances: CreditBalanceRow[];
  isAdmin: boolean;
  teacherId: string;
};

function matchesSearch(balance: CreditBalanceRow, search: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt");

  if (!normalizedSearch) {
    return true;
  }

  return (
    balance.fullName.toLocaleLowerCase("pt").includes(normalizedSearch) ||
    balance.memberNumber.toLocaleLowerCase("pt").includes(normalizedSearch)
  );
}

export function PersonalTrainingCreditSearch({ balances, isAdmin, teacherId }: Props) {
  const [search, setSearch] = useState("");
  const filteredBalances = useMemo(() => balances.filter((balance) => matchesSearch(balance, search)), [balances, search]);

  return (
    <div className="tab-content">
      <div className="live-search-row">
        <div className="field wide">
          <label htmlFor="creditSearch">Pesquisar utente</label>
          <input
            id="creditSearch"
            placeholder="N. utente ou nome"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="status active">{filteredBalances.length} registos</span>
      </div>

      <div className="credits-table">
        <div className={isAdmin ? "credits-header admin-credits-row" : "credits-header"}>
          <span>Utente</span>
          <span>Tipo</span>
          <span>Comprados</span>
          <span>Ajustes</span>
          <span>Usados</span>
          <span>Saldo</span>
          <span>Estado</span>
          {isAdmin ? <span>Corrigir saldo</span> : null}
        </div>
        {filteredBalances.length === 0 ? <p className="muted">Sem saldos compativeis com a pesquisa.</p> : null}
        {filteredBalances.map((balance) => (
          <div className={isAdmin ? "credits-row admin-credits-row" : "credits-row"} key={`${balance.studentId}-${balance.trainingTypeName}`}>
            <span>
              {balance.fullName}
              <small>{balance.memberNumber}</small>
            </span>
            <span>{balance.trainingTypeName}</span>
            <span>{balance.purchasedCredits}</span>
            <span className={balance.adjustedCredits < 0 ? "negative-balance" : ""}>{balance.adjustedCredits}</span>
            <span>{balance.usedCredits}</span>
            <span className={balance.availableCredits < 0 ? "negative-balance" : ""}>{balance.availableCredits}</span>
            <span className={balance.canBook ? "status active" : "status inactive"}>{balance.canBook ? "Pode marcar" : "Sem margem"}</span>
            {isAdmin ? (
              <form className="credit-adjust-form" action="/api/personal-training/credit-adjustments" method="post">
                <input type="hidden" name="teacherId" value={teacherId} />
                <input type="hidden" name="studentId" value={balance.studentId} />
                <input type="hidden" name="trainingTypeKey" value={balance.trainingTypeKey} />
                <input name="targetAvailableCredits" type="number" step="1" defaultValue={balance.availableCredits} title="Saldo pretendido" />
                <input name="reason" placeholder="Motivo" title="Motivo" />
                <button className="button secondary" type="submit">
                  Guardar
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
