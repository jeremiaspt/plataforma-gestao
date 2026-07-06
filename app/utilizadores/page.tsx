import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { billingCycleOptions, getBillingCycleLabel } from "@/lib/billingCycles";
import { prisma } from "@/lib/prisma";
import { roleOptions } from "@/lib/roles";

const usersPerPage = 10;

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const currentUser = await requireUser();
  const params = await searchParams;
  const roleKeys = currentUser.roles.map((userRole) => userRole.role.key);
  const query = String(params.q || "").trim();
  const currentPage = Math.max(1, Number(params.page) || 1);

  if (!hasRole(currentUser, "admin")) {
    redirect("/dashboard");
  }

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: query, mode: "insensitive" as const } },
          { roles: { some: { role: { label: { contains: query, mode: "insensitive" as const } } } } },
          { roles: { some: { role: { key: { contains: query, mode: "insensitive" as const } } } } }
        ]
      }
    : {};

  const [users, totalUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (currentPage - 1) * usersPerPage,
      take: usersPerPage,
      include: { roles: { include: { role: true } } }
    }),
    prisma.user.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalUsers / usersPerPage));
  const previousPageHref = `/utilizadores?q=${encodeURIComponent(query)}&page=${Math.max(1, currentPage - 1)}`;
  const nextPageHref = `/utilizadores?q=${encodeURIComponent(query)}&page=${Math.min(totalPages, currentPage + 1)}`;

  return (
    <AppShell userName={currentUser.name} roles={roleKeys}>
      <section className="panel users-hero">
        <div className="topbar">
          <div>
            <p className="eyebrow">Administracao</p>
            <h1>Utilizadores</h1>
            <p className="muted">Cria utilizadores, gere categorias, ciclos de faturacao e estado de acesso.</p>
          </div>
        </div>

        <form className="form user-create-form" action="/api/users" method="post">
          <div className="grid">
            <div className="field">
              <label htmlFor="name">Nome</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="phone">Contacto</label>
              <input id="phone" name="phone" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="password">Password inicial</label>
            <input id="password" name="password" type="password" required minLength={8} />
          </div>
          <div className="field">
            <label>Categorias</label>
            <div className="checkbox-grid">
              {roleOptions.map((role) => (
                <label className="checkbox" key={role.key}>
                  <input type="checkbox" name="roles" value={role.key} />
                  {role.label}
                </label>
              ))}
            </div>
          </div>
          <button className="button" type="submit">
            Criar utilizador
          </button>
        </form>
      </section>

      <section className="panel users-list-panel">
        <div className="section-heading">
          <div>
            <h2>Lista de utilizadores</h2>
            <p className="muted">{totalUsers} utilizadores encontrados.</p>
          </div>
        </div>

        <form className="user-search-form" action="/utilizadores" method="get">
          <div className="field">
            <label htmlFor="q">Pesquisar</label>
            <input id="q" name="q" defaultValue={query} placeholder="Nome, email, contacto ou categoria" />
          </div>
          <button className="button secondary" type="submit">
            Pesquisar
          </button>
          {query ? (
            <a className="button secondary" href="/utilizadores">
              Limpar
            </a>
          ) : null}
        </form>

        <div className="users-table">
          <div className="users-header">
            <span>Dados</span>
            <span>Contacto</span>
            <span>Categorias</span>
            <span>Ciclo</span>
            <span>Estado</span>
            <span>Acoes</span>
          </div>
          {users.length === 0 ? <p className="muted">Nao existem utilizadores para a pesquisa indicada.</p> : null}
          {users.map((user) => (
            <form className="user-edit users-row" action={`/api/users/${user.id}`} method="post" key={user.id}>
              <div className="user-identity-fields">
                <input name="name" defaultValue={user.name} required aria-label="Nome" />
                <input name="email" type="email" defaultValue={user.email} required aria-label="Email" />
              </div>
              <input name="phone" defaultValue={user.phone || ""} aria-label="Contacto" />
              <div className="checkbox-grid compact">
                {roleOptions.map((role) => (
                  <label className="checkbox" key={role.key}>
                    <input
                      type="checkbox"
                      name="roles"
                      value={role.key}
                      defaultChecked={user.roles.some((userRole) => userRole.role.key === role.key)}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
              <select name="billingCycle" defaultValue={user.billingCycle} title={getBillingCycleLabel(user.billingCycle)}>
                {billingCycleOptions.map((option) => (
                  <option value={option.key} key={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={user.active ? "status active" : "status inactive"}>{user.active ? "Ativo" : "Inativo"}</span>
              <div className="action-row compact-actions">
                <button className="button secondary" name="action" value="update" type="submit">
                  Guardar
                </button>
                <button className="button secondary" name="action" value="toggle-active" type="submit">
                  {user.active ? "Desativar" : "Ativar"}
                </button>
                <button className="button danger" name="action" value="delete" type="submit">
                  Remover
                </button>
              </div>
            </form>
          ))}
        </div>

        <div className="pagination">
          <span className="muted">
            Pagina {currentPage} de {totalPages}
          </span>
          <div className="action-row compact-actions">
            <a className={currentPage <= 1 ? "button secondary disabled-link" : "button secondary"} href={previousPageHref}>
              Anterior
            </a>
            <a className={currentPage >= totalPages ? "button secondary disabled-link" : "button secondary"} href={nextPageHref}>
              Seguinte
            </a>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
