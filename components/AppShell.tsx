import Link from "next/link";
import {
  Activity,
  Brush,
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Repeat2,
  Settings,
  UserPlus,
  UserRound,
  Users,
  Waves,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { currentBillingMonthValue } from "@/lib/billingCycles";
import { calculateGroupClassTimesheet } from "@/lib/groupClassTimesheet";
import { getSystemSettings } from "@/lib/maintenance";
import { formatCurrency } from "@/lib/money";
import { calculatePersonalTrainingTimesheet } from "@/lib/personalTrainingTimesheet";

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: "admin" | "pool" | "classes" | "payments" | "general" | "support";
};

function NavSection({ items, title }: { title: string; items: NavItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="nav-section">
      <span className="nav-label">{title}</span>
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link href={item.href} key={item.href}>
            <span className={`nav-icon nav-icon-${item.tone}`}>
              <Icon size={17} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

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
  const isProfessor = roles.includes("professor");
  const isReception = roles.includes("recepcao");
  const canUsePool = isAdmin || isProfessor || isReception;
  const canUsePayments = isAdmin || isProfessor || isReception;
  const canUseReceptionClasses = isAdmin || isReception;
  const canUseCleaning = roles.includes("limpeza");
  const canUseMaintenance = roles.includes("manutencao");
  const systemSettings = await getSystemSettings();
  const currentUser = isProfessor ? await getSessionUser() : null;
  const monthValue = currentBillingMonthValue();
  const summary =
    isProfessor && currentUser
      ? await Promise.all([
          calculateGroupClassTimesheet({
            excludeDockSupportOverlapWithClasses: systemSettings.excludeDockSupportOverlapWithClasses,
            holidayOptions: {
              includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
              includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
              includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
            },
            month: monthValue,
            teacherId: currentUser.id
          }),
          calculatePersonalTrainingTimesheet({ month: monthValue, teacherId: currentUser.id })
        ]).catch(() => [null, null] as const)
      : null;
  const groupHoursTotal = summary?.[0]?.rows.reduce((total, row) => total + row.totalValue, 0) || 0;
  const personalTrainingTotal = summary?.[1]?.rows.reduce((total, row) => total + row.totalValue, 0) || 0;

  const mainItems: NavItem[] = [{ href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", tone: "general" }];
  const adminItems: NavItem[] = isAdmin
    ? [
        { href: "/utilizadores", icon: Users, label: "Utilizadores", tone: "admin" },
        { href: "/atividade", icon: Activity, label: "Atividade", tone: "admin" },
        { href: "/configuracoes-email", icon: Mail, label: "Emails", tone: "admin" },
        { href: "/configuracoes-sistema", icon: Settings, label: "Sistema", tone: "admin" },
        { href: "/valor-hora-aulas", icon: FileSpreadsheet, label: "Valor hora", tone: "admin" },
        { href: "/treinos-personalizados/tipos", icon: Dumbbell, label: "Treinos personalizados", tone: "admin" },
        { href: "/configurar-folha-treinos", icon: FileSpreadsheet, label: "Config. folha treinos", tone: "admin" }
      ]
    : [];
  const poolItems: NavItem[] = canUsePool
    ? [
        { href: "/piscina-25m", icon: Waves, label: "Mapa P25m", tone: "pool" },
        { href: "/tanque-aprendizagem", icon: Waves, label: "Tanque aprendizagem", tone: "pool" },
        { href: "/apoio-ao-cais", icon: Waves, label: "Apoio ao Cais", tone: "pool" }
      ]
    : [];
  const classItems: NavItem[] =
    isAdmin || isProfessor
      ? [
          { href: "/aulas-grupo", icon: CalendarDays, label: "Aulas de grupo", tone: "classes" },
          { href: "/substituicoes", icon: CalendarCheck, label: "Substituições", tone: "classes" },
          { href: "/folha-horas-aulas", icon: FileSpreadsheet, label: "Folha de horas", tone: "classes" }
        ]
      : [];
  const paymentItems: NavItem[] = canUsePayments
    ? [
        { href: "/treinos-personalizados/pagamentos", icon: Dumbbell, label: "Pagamento TP", tone: "payments" },
        ...(isAdmin || isProfessor ? [{ href: "/folha-treinos", icon: FileSpreadsheet, label: "Folha de treinos", tone: "payments" as const }] : [])
      ]
    : [];
  const receptionItems: NavItem[] = canUseReceptionClasses
    ? [
        { href: "/troca-de-turma", icon: Repeat2, label: "Troca de turma", tone: "classes" },
        { href: "/novas-inscricoes", icon: UserPlus, label: "Novas inscricoes", tone: "classes" }
      ]
    : [];
  const operationalItems: NavItem[] = [
    ...(canUseCleaning ? [{ href: "#", icon: Brush, label: "Limpeza", tone: "support" as const }] : []),
    ...(canUseMaintenance ? [{ href: "#", icon: Wrench, label: "Manutenção", tone: "support" as const }] : [])
  ];

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
        <input className="sidebar-toggle-input" id="sidebar-toggle" type="checkbox" />
        <label className="sidebar-toggle-button" htmlFor="sidebar-toggle">
          <Menu size={17} />
          Menu
        </label>
        <nav className="nav">
          <NavSection title="Principal" items={mainItems} />
          <NavSection title="Administração" items={adminItems} />
          <NavSection title="Mapas de disponibilidade" items={poolItems} />
          <NavSection title="Aulas de grupo" items={classItems} />
          <NavSection title="Recepcao" items={receptionItems} />
          <NavSection title="Treinos personalizados" items={paymentItems} />
          <NavSection title="Operacional" items={operationalItems} />

          <div className="nav-section">
            <span className="nav-label">Geral</span>
            <Link href="/conta">
              <span className="nav-icon nav-icon-general">
                <UserRound size={17} />
              </span>
              A minha conta
            </Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit">
                <span className="nav-icon nav-icon-general">
                  <LogOut size={17} />
                </span>
                Sair
              </button>
            </form>
          </div>
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
          {isProfessor ? (
            <div className="user-month-summary">
              <span>
                <small>Folha horas</small>
                <strong>{formatCurrency(groupHoursTotal)}</strong>
              </span>
              <span>
                <small>Treinos ciclo</small>
                <strong>{formatCurrency(personalTrainingTotal)}</strong>
              </span>
            </div>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
