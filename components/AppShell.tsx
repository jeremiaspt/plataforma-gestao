import Link from "next/link";
import { Dumbbell, LayoutDashboard, LogOut, Mail, UserRound, Users, Waves } from "lucide-react";

export function AppShell({
  children,
  userName,
  roles
}: {
  children: React.ReactNode;
  userName: string;
  roles: string[];
}) {
  const isAdmin = roles.includes("admin");
  const canUsePool = isAdmin || roles.includes("professor") || roles.includes("recepcao");
  const canUsePayments = isAdmin || roles.includes("professor") || roles.includes("recepcao");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PG</span>
          <span>
            <strong>Plataforma</strong>
            <small>Gestao operacional</small>
          </span>
        </div>
        <nav className="nav">
          <span className="nav-label">Principal</span>
          <Link href="/dashboard">
            <LayoutDashboard size={18} />
            Dashboard
          </Link>
          {canUsePool ? (
            <Link href="/piscina-25m">
              <Waves size={18} />
              Piscina 25m
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/treinos-personalizados/tipos">
              <Dumbbell size={18} />
              Treinos Personalizados
            </Link>
          ) : null}
          {canUsePayments ? (
            <Link href="/treinos-personalizados/pagamentos">
              <Dumbbell size={18} />
              Pagamentos TP
            </Link>
          ) : null}
          <span className="nav-label">Configuracao</span>
          {isAdmin ? (
            <Link href="/utilizadores">
              <Users size={18} />
              Utilizadores
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/configuracoes-email">
              <Mail size={18} />
              Emails
            </Link>
          ) : null}
          <Link href="/conta">
            <UserRound size={18} />
            A minha conta
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit">
              <LogOut size={18} />
              Sair
            </button>
          </form>
        </nav>
      </aside>
      <main className="main">
        <div className="app-topbar">
          <div>
            <p className="eyebrow">Sessao iniciada</p>
            <h1>{userName}</h1>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
