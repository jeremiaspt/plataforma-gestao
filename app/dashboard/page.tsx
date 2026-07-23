import {
  ArrowRight,
  Activity,
  Brush,
  Cake,
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  FileSpreadsheet,
  Mail,
  Repeat2,
  Settings,
  UserPlus,
  UserRound,
  Users,
  Waves,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

type ToolCard = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  tone: "admin" | "pool" | "classes" | "payments" | "general" | "support";
};

type ToolSection = {
  title: string;
  description: string;
  tools: ToolCard[];
};

const sections: ToolSection[] = [
  {
    title: "Administração",
    description: "Configuração, acessos e regras da plataforma.",
    tools: [
      {
        title: "Utilizadores",
        description: "Criar, editar e autorizar acessos.",
        roles: ["admin"],
        href: "/utilizadores",
        icon: Users,
        tone: "admin"
      },
      {
        title: "Atividade",
        description: "Consultar registos de ações importantes.",
        roles: ["admin"],
        href: "/atividade",
        icon: Activity,
        tone: "admin"
      },
      {
        title: "Emails",
        description: "Configurar envios e consultar logs.",
        roles: ["admin"],
        href: "/configuracoes-email",
        icon: Mail,
        tone: "admin"
      },
      {
        title: "Sistema",
        description: "Modo manutenção e regras gerais.",
        roles: ["admin"],
        href: "/configuracoes-sistema",
        icon: Settings,
        tone: "admin"
      },
      {
        title: "Valor hora",
        description: "Configurar valores da folha de horas.",
        roles: ["admin"],
        href: "/valor-hora-aulas",
        icon: FileSpreadsheet,
        tone: "admin"
      },
      {
        title: "Treinos personalizados",
        description: "Configurar tipos, créditos e valores.",
        roles: ["admin"],
        href: "/treinos-personalizados/tipos",
        icon: Dumbbell,
        tone: "admin"
      },
      {
        title: "Config. folha treinos",
        description: "Definir Caract. e ordem da folha de treinos.",
        roles: ["admin"],
        href: "/configurar-folha-treinos",
        icon: FileSpreadsheet,
        tone: "admin"
      }
    ]
  },
  {
    title: "Mapas de disponibilidade",
    description: "Consulta dos espaços e ocupações por dia.",
    tools: [
      {
        title: "Mapa P25m",
        description: "Piscina 25m por pista e horário.",
        roles: ["admin", "professor", "recepcao"],
        href: "/piscina-25m",
        icon: Waves,
        tone: "pool"
      },
      {
        title: "Tanque aprendizagem",
        description: "Tanque por espaço e horário.",
        roles: ["admin", "professor", "recepcao"],
        href: "/tanque-aprendizagem",
        icon: Waves,
        tone: "pool"
      },
      {
        title: "Apoio ao Cais",
        description: "Disponibilidade por professor e horário.",
        roles: ["admin", "professor", "recepcao"],
        href: "/apoio-ao-cais",
        icon: Waves,
        tone: "pool"
      }
    ]
  },
  {
    title: "Aulas de grupo",
    description: "Horários, substituições e folha de horas.",
    tools: [
      {
        title: "Aulas de grupo",
        description: "Consultar horário semanal por professor.",
        roles: ["admin", "professor"],
        href: "/aulas-grupo",
        icon: CalendarDays,
        tone: "classes"
      },
      {
        title: "Substituições",
        description: "Gerir faltas, substitutos e visão geral.",
        roles: ["admin", "professor"],
        href: "/substituicoes",
        icon: CalendarCheck,
        tone: "classes"
      },
      {
        title: "Folha de horas",
        description: "Consultar a folha de horas das aulas.",
        roles: ["admin", "professor"],
        href: "/folha-horas-aulas",
        icon: FileSpreadsheet,
        tone: "classes"
      }
    ]
  },
  {
    title: "Recepcao",
    description: "Registos de secretaria ligados as aulas de grupo.",
    tools: [
      {
        title: "Troca de turma",
        description: "Notificar professores sobre alteracoes de turma.",
        roles: ["admin", "recepcao"],
        href: "/troca-de-turma",
        icon: Repeat2,
        tone: "classes"
      },
      {
        title: "Novas inscricoes",
        description: "Registar inscricoes e notificar professores.",
        roles: ["admin", "recepcao"],
        href: "/novas-inscricoes",
        icon: UserPlus,
        tone: "classes"
      }
    ]
  },
  {
    title: "Festas Aniversario",
    description: "Mapa mensal, monitores e estado dos pagamentos.",
    tools: [
      {
        title: "Mapa de festas",
        description: "Gerir festas e consultar pagamentos.",
        roles: ["admin", "recepcao"],
        href: "/festas-aniversario",
        icon: Cake,
        tone: "support"
      }
    ]
  },
  {
    title: "Treinos personalizados",
    description: "Pagamentos e créditos de treinos personalizados.",
    tools: [
      {
        title: "Pagamento TP",
        description: "Lançar ou consultar pagamentos TP.",
        roles: ["admin", "professor", "recepcao"],
        href: "/treinos-personalizados/pagamentos",
        icon: Dumbbell,
        tone: "payments"
      },
      {
        title: "Folha de treinos",
        description: "Consultar treinos por professor e ciclo.",
        roles: ["admin", "professor"],
        href: "/folha-treinos",
        icon: FileSpreadsheet,
        tone: "payments"
      }
    ]
  },
  {
    title: "Operacional",
    description: "Áreas internas por equipa.",
    tools: [
      { title: "Limpeza", description: "Tarefas e estados de execução.", roles: ["limpeza"], href: "#", icon: Brush, tone: "support" },
      { title: "Manutenção", description: "Pedidos, prioridades e resolução.", roles: ["manutencao"], href: "#", icon: Wrench, tone: "support" }
    ]
  },
  {
    title: "Geral",
    description: "Conta pessoal e preferências.",
    tools: [
      {
        title: "A minha conta",
        description: "Alterar password e consultar dados pessoais.",
        roles: ["admin", "professor", "recepcao", "limpeza", "manutencao"],
        href: "/conta",
        icon: UserRound,
        tone: "general"
      }
    ]
  }
];

function canSeeTool(roles: string[], tool: ToolCard) {
  return tool.roles.some((role) => roles.includes(role));
}

export default async function DashboardPage() {
  const user = await requireUser();
  const roles = user.roles.map((userRole) => userRole.role.key);
  const visibleSections = sections
    .map((section) => ({
      ...section,
      tools: section.tools.filter((tool) => canSeeTool(roles, tool))
    }))
    .filter((section) => section.tools.length > 0);
  const toolCount = visibleSections.reduce((count, section) => count + section.tools.length, 0);

  return (
    <AppShell userName={user.name} roles={roles}>
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Área de trabalho</p>
          <h1>Ferramentas disponíveis</h1>
          <p className="muted">Acede rapidamente às áreas autorizadas para o teu utilizador.</p>
        </div>
        <span className="status active">{toolCount} ferramentas</span>
      </section>

      <section className="dashboard-sections">
        {visibleSections.map((section) => (
          <div className="dashboard-section" key={section.title}>
            <div className="dashboard-section-head">
              <h2>{section.title}</h2>
              <p className="muted">{section.description}</p>
            </div>
            <div className="grid dashboard-grid">
              {section.tools.map((tool) => {
                const Icon = tool.icon;

                return (
                  <a className="card tool-card" href={tool.href} key={tool.href}>
                    <span className={`tool-icon tool-icon-${tool.tone}`}>
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
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
