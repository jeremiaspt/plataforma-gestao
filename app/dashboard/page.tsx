import { ArrowRight, Brush, CalendarDays, Dumbbell, FileSpreadsheet, Settings, Users, Waves } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

const toolCards = [
  {
    title: "Utilizadores",
    description: "Criar, editar e autorizar acessos.",
    role: "admin",
    href: "/utilizadores",
    icon: Users
  },
  {
    title: "Treinos Personalizados",
    description: "Configurar pagamentos e créditos.",
    role: "admin",
    href: "/treinos-personalizados/tipos",
    icon: Settings
  },
  {
    title: "Sistema",
    description: "Ativar ou desativar o modo manutenção.",
    role: "admin",
    href: "/configuracoes-sistema",
    icon: Settings
  },
  {
    title: "Valor hora aulas",
    description: "Configurar características e valores da folha.",
    role: "admin",
    href: "/valor-hora-aulas",
    icon: FileSpreadsheet
  },
  {
    title: "Pagamentos TP",
    description: "Lançar pagamentos de treinos personalizados.",
    role: "recepcao",
    href: "/treinos-personalizados/pagamentos",
    icon: Dumbbell
  },
  {
    title: "Pagamentos TP",
    description: "Consultar pagamentos lançados.",
    role: "professor",
    href: "/treinos-personalizados/pagamentos",
    icon: Dumbbell
  },
  {
    title: "Piscina 25m",
    description: "Mapa de disponibilidade por pista e dia.",
    role: "professor",
    href: "/piscina-25m",
    icon: Waves
  },
  {
    title: "Piscina 25m",
    description: "Mapa de disponibilidade por pista e dia.",
    role: "recepcao",
    href: "/piscina-25m",
    icon: Waves
  },
  {
    title: "Tanque de aprendizagem",
    description: "Mapa de disponibilidade por espaço e dia.",
    role: "professor",
    href: "/tanque-aprendizagem",
    icon: Waves
  },
  {
    title: "Tanque de aprendizagem",
    description: "Mapa de disponibilidade por espaço e dia.",
    role: "recepcao",
    href: "/tanque-aprendizagem",
    icon: Waves
  },
  {
    title: "Apoio ao Cais",
    description: "Mapa de disponibilidade por professor e horário.",
    role: "professor",
    href: "/apoio-ao-cais",
    icon: Waves
  },
  {
    title: "Apoio ao Cais",
    description: "Mapa de disponibilidade por professor e horário.",
    role: "recepcao",
    href: "/apoio-ao-cais",
    icon: Waves
  },
  {
    title: "Aulas de grupo",
    description: "Consultar horário semanal por professor.",
    role: "admin",
    href: "/aulas-grupo",
    icon: CalendarDays
  },
  {
    title: "Aulas de grupo",
    description: "Horário semanal das aulas associadas ao professor.",
    role: "professor",
    href: "/aulas-grupo",
    icon: CalendarDays
  },
  {
    title: "Folha de horas",
    description: "Consultar a folha de horas das aulas de grupo.",
    role: "admin",
    href: "/folha-horas-aulas",
    icon: FileSpreadsheet
  },
  {
    title: "Folha de horas",
    description: "Consultar a folha de horas das tuas aulas.",
    role: "professor",
    href: "/folha-horas-aulas",
    icon: FileSpreadsheet
  },
  { title: "Limpeza", description: "Tarefas e estados de execução.", role: "limpeza", href: "#", icon: Brush },
  { title: "Manutenção", description: "Pedidos, prioridades e resolução.", role: "manutencao", href: "#", icon: Settings }
];

export default async function DashboardPage() {
  const user = await requireUser();
  const roles = user.roles.map((userRole) => userRole.role.key);
  const allowedTools = roles.includes("admin") ? toolCards : toolCards.filter((tool) => roles.includes(tool.role));
  const visibleTools = allowedTools.filter(
    (tool, index, list) => list.findIndex((item) => item.title === tool.title && item.href === tool.href) === index
  );

  return (
    <AppShell userName={user.name} roles={roles}>
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Área de trabalho</p>
          <h1>Ferramentas disponíveis</h1>
          <p className="muted">Acede rapidamente às áreas autorizadas para o teu utilizador.</p>
        </div>
        <span className="status active">{visibleTools.length} ferramentas</span>
      </section>

      <section className="grid dashboard-grid">
        {visibleTools.map((tool, index) => {
          const Icon = tool.icon;

          return (
            <a className="card tool-card" href={tool.href} key={`${tool.title}-${index}`}>
              <span className="tool-icon">
                <Icon size={20} />
              </span>
              <span>
                <h2>{tool.title}</h2>
                <p className="muted">{tool.description}</p>
              </span>
              <ArrowRight className="tool-arrow" size={18} />
            </a>
          );
        })}
      </section>
    </AppShell>
  );
}
