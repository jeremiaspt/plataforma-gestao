"use client";

import { useMemo, useState } from "react";

type LoginRow = {
  id: string;
  createdAtLabel: string;
  userName: string;
  userEmail: string;
  ipAddress: string;
  browser: string;
  platform: string;
  city: string;
  country: string;
};

function matchesSearch(row: LoginRow, search: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt");
  if (!normalizedSearch) return true;

  return [row.userName, row.userEmail, row.ipAddress, row.browser, row.platform, row.city, row.country]
    .join(" ")
    .toLocaleLowerCase("pt")
    .includes(normalizedSearch);
}

export function LoginActivitySearch({ logs }: { logs: LoginRow[] }) {
  const [search, setSearch] = useState("");
  const filteredLogs = useMemo(() => logs.filter((log) => matchesSearch(log, search)), [logs, search]);

  return (
    <div className="login-activity-section">
      <div className="live-search-row">
        <div className="field">
          <label htmlFor="loginSearch">Pesquisar login</label>
          <input
            id="loginSearch"
            type="search"
            placeholder="Utilizador, email, IP, cidade, pais ou plataforma"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="activity-table login-activity-table">
        <div className="login-activity-header">
          <span>Data</span>
          <span>Utilizador</span>
          <span>IP</span>
          <span>Browser</span>
          <span>Plataforma</span>
          <span>Localidade</span>
        </div>
        {filteredLogs.length === 0 ? <p className="muted">Nao existem logins compativeis com a pesquisa.</p> : null}
        {filteredLogs.map((log) => (
          <div className="login-activity-row" key={log.id}>
            <span>{log.createdAtLabel}</span>
            <span>
              {log.userName}
              <small>{log.userEmail}</small>
            </span>
            <span>{log.ipAddress}</span>
            <span>{log.browser}</span>
            <span>{log.platform}</span>
            <span>{[log.city, log.country].filter(Boolean).join(", ") || "Desconhecida"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
