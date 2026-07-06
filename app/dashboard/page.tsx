import { ArrowRight, Brush, Dumbbell, Settings, Users, Waves } from "lucide-react";
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
    description: "Configurar pagamentos e creditos.",
    role: "admin",
    href: "/treinos-personalizados/tipos",
    icon: Settings
  },
  {
    title: "Pagamentos TP",
    description: "Lancar pagamentos de treinos personalizados.",
    role: "recepcao",
    href: "/treinos-personalizados/pagamentos",
    icon: Dumbbell
  },
  {
    title: "Pagamentos TP",
    description: "Consultar pagamentos lancados.",
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
  { title: "Limpeza", description: "Tarefas e estados de execucao.", role: "limpeza", href: "#", icon: Brush },
  { title: "Manutencao", description: "Pedidos, prioridades e resolucao.", role: "manutencao", href: "#", icon: Settings }
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
          <p className="eyebrow">Area de trabalho</p>
          <h1>Ferramentas disponiveis</h1>
          <p className="muted">Acede rapidamente as areas autorizadas para o teu utilizador.</p>
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
