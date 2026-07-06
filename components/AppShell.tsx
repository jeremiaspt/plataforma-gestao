import Link from "next/link";
import { Dumbbell, LayoutDashboard, LogOut, Mail, UserRound, Users, Waves } from "lucide-react";

export function AppShell({
  children,
  userName
}: {
  children: React.ReactNode;
  userName: string;
}) {
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
          <Link href="/utilizadores">
            <Users size={18} />
            Utilizadores
          </Link>
          <Link href="/piscina-25m">
            <Waves size={18} />
            Piscina 25m
          </Link>
          <Link href="/treinos-personalizados/tipos">
            <Dumbbell size={18} />
            Treinos Personalizados
          </Link>
          <Link href="/treinos-personalizados/pagamentos">
            <Dumbbell size={18} />
            Pagamentos TP
          </Link>
          <span className="nav-label">Configuracao</span>
          <Link href="/configuracoes-email">
            <Mail size={18} />
            Emails
          </Link>
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
