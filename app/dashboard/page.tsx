import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

const toolCards = [
  { title: "Utilizadores", description: "Criar, editar e autorizar acessos.", role: "admin", href: "/utilizadores" },
  { title: "Piscina 25m", description: "Mapa de disponibilidade por pista e dia.", role: "professor", href: "/piscina-25m" },
  { title: "Piscina 25m", description: "Mapa de disponibilidade por pista e dia.", role: "recepcao", href: "/piscina-25m" },
  { title: "Limpeza", description: "Tarefas e estados de execução.", role: "limpeza", href: "#" },
  { title: "Manutenção", description: "Pedidos, prioridades e resolução.", role: "manutencao", href: "#" }
];

export default async function DashboardPage() {
  const user = await requireUser();
  const roles = user.roles.map((userRole) => userRole.role.key);
  const visibleTools = roles.includes("admin")
    ? toolCards.filter((tool, index, list) => list.findIndex((item) => item.title === tool.title) === index)
    : toolCards.filter((tool) => roles.includes(tool.role));

  return (
    <AppShell userName={user.name}>
      <section className="grid">
        {visibleTools.map((tool, index) => (
          <a className="card" href={tool.href} key={`${tool.title}-${index}`}>
            <h2>{tool.title}</h2>
            <p className="muted">{tool.description}</p>
          </a>
        ))}
      </section>
    </AppShell>
  );
}
