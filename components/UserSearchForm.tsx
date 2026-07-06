"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function UserSearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const trimmedQuery = query.trim();
      const href = trimmedQuery ? `/utilizadores?q=${encodeURIComponent(trimmedQuery)}` : "/utilizadores";
      router.replace(href);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [query, router]);

  return (
    <div className="user-search-form">
      <div className="field">
        <label htmlFor="q">Pesquisar</label>
        <input
          id="q"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome, email, contacto ou categoria"
        />
      </div>
      {query ? (
        <button className="button secondary" type="button" onClick={() => setQuery("")}>
          Limpar
        </button>
      ) : null}
    </div>
  );
}
