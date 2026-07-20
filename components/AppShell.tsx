import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  UserRound,
  Users,
  Waves
} from "lucide-react";
import { getSystemSettings } from "@/lib/maintenance";

export async function AppShell({
  children,
  userName,
  roles
}: {
  children: React.ReactNode;
  userName: string;
  roles: string[];
}) {
  const isAdmin = roles.includes("admin");
  const canUseGroupClasses = isAdmin || roles.includes("professor");
  const canUsePool = isAdmin || roles.includes("professor") || roles.includes("recepcao");
  const canUsePayments = isAdmin || roles.includes("professor") || roles.includes("recepcao");
  const systemSettings = await getSystemSettings();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PG</span>
          <span>
            <strong>Plataforma</strong>
            <small>Gestão operacional</small>
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
          {canUsePool ? (
            <Link href="/tanque-aprendizagem">
              <Waves size={18} />
              Tanque aprendizagem
            </Link>
          ) : null}
          {canUsePool ? (
            <Link href="/apoio-ao-cais">
              <Waves size={18} />
              Apoio ao Cais
            </Link>
          ) : null}
          {canUseGroupClasses ? (
            <Link href="/aulas-grupo">
              <CalendarDays size={18} />
              Aulas de grupo
            </Link>
          ) : null}
          {canUseGroupClasses ? (
            <Link href="/substituicoes">
              <CalendarCheck size={18} />
              Substituições
            </Link>
          ) : null}
          {canUseGroupClasses ? (
            <Link href="/folha-horas-aulas">
              <FileSpreadsheet size={18} />
              Folha de horas
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
          <span className="nav-label">Configuração</span>
          {isAdmin ? (
            <Link href="/utilizadores">
              <Users size={18} />
              Utilizadores
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/atividade">
              <Activity size={18} />
              Atividade
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/configuracoes-email">
              <Mail size={18} />
              Emails
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/configuracoes-sistema">
              <Settings size={18} />
              Sistema
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/valor-hora-aulas">
              <FileSpreadsheet size={18} />
              Valor hora aulas
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
        {systemSettings.maintenanceMode ? (
          <div className="maintenance-banner">
            <strong>Plataforma em manutenção.</strong>
            <span>
              Os utilizadores podem consultar informação já registada, mas apenas administradores conseguem lançar ou alterar registos.
            </span>
          </div>
        ) : null}
        <div className="app-topbar">
          <div>
            <p className="eyebrow">Sessão iniciada</p>
            <h1>{userName}</h1>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
