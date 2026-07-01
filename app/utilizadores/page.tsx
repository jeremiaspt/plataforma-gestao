import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
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
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.phone || "-"}</td>
                <td>
                  <div className="badge-row">
                    {user.roles.map((userRole) => (
                      <span className="badge" key={userRole.role.id}>
                        {userRole.role.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
