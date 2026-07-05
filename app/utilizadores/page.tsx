import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { billingCycleOptions, getBillingCycleLabel } from "@/lib/billingCycles";
import { prisma } from "@/lib/prisma";
import { roleOptions } from "@/lib/roles";

export default async function UsersPage() {
  const currentUser = await requireUser();

  if (!hasRole(currentUser, "admin")) {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { roles: { include: { role: true } } }
  });

  return (
    <AppShell userName={currentUser.name}>
      <section className="panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Administração</p>
            <h1>Utilizadores</h1>
          </div>
        </div>

        <form className="form" action="/api/users" method="post">
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

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Lista de utilizadores</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Contacto</th>
              <th>Categorias</th>
              <th>Ciclo</th>
              <th>Estado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td colSpan={7}>
                  <form className="user-edit" action={`/api/users/${user.id}`} method="post">
                    <div className="user-edit-grid">
                      <input name="name" defaultValue={user.name} required />
                      <input name="email" type="email" defaultValue={user.email} required />
                      <input name="phone" defaultValue={user.phone || ""} />
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
                      <span className={user.active ? "status active" : "status inactive"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                      <div className="action-row">
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
                    </div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
