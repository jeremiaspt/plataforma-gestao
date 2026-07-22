"use client";

import { useState } from "react";

export function PersonalTrainingImportForm() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/personal-training-payments/import", {
        body: new FormData(event.currentTarget),
        method: "POST"
      });

      window.location.href = response.url || "/atividade?tab=maintenance&importError=1";
    } catch {
      setError("Não foi possível enviar o ficheiro. Atualiza a página e tenta novamente.");
      setSubmitting(false);
    }
  }

  return (
    <form className="maintenance-card" onSubmit={handleSubmit}>
      <div>
        <h2>Importar pagamentos TP por Excel</h2>
        <p className="muted">
          Primeira linha com cabeçalhos. Colunas: A número utente, B nome utente, C professor, D pack, E quantidade, G data pagamento, H rececionista.
        </p>
      </div>
      <div className="field">
        <label htmlFor="paymentsFile">Ficheiro Excel</label>
        <input id="paymentsFile" name="paymentsFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        {error ? <small className="negative-balance">{error}</small> : null}
      </div>
      <button className="button secondary" type="submit" disabled={submitting}>
        {submitting ? "A validar..." : "Validar e importar"}
      </button>
    </form>
  );
}
