import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

const toolCards = [
  { title: "Utilizadores", description: "Criar, editar e autorizar acessos.", role: "admin" },
  { title: "Professores", description: "Aulas, presenças e acompanhamento.", role: "professor" },
  { title: "Recepção", description: "Atendimento, inscrições e marcações.", role: "recepcao" },
  { title: "Limpeza", description: "Tarefas e estados de execução.", role: "limpeza" },
  { title: "Manutenção", description: "Pedidos, prioridades e resolução.", role: "manutencao" }
];

export default async function DashboardPage() {
  const user = await requireUser();
  const roles = user.roles.map((userRole) => userRole.role.key);
  const visibleTools = roles.includes("admin")
    ? toolCards
    : toolCards.filter((tool) => roles.includes(tool.role));

  return (
    <AppShell userName={user.name}>
      <section className="grid">
        {visibleTools.map((tool) => (
          <article className="card" key={tool.title}>
            <h2>{tool.title}</h2>
            <p className="muted">{tool.description}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
