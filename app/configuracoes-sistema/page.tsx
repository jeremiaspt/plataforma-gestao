import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { getSystemSettings } from "@/lib/maintenance";

export default async function SystemSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const settings = await getSystemSettings();

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel system-settings-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Configuração</p>
            <h1>Sistema</h1>
            <p className="muted">Controla o modo de manutenção da plataforma durante alterações ou updates.</p>
          </div>
          <span className={settings.maintenanceMode ? "status inactive" : "status active"}>
            {settings.maintenanceMode ? "Em manutenção" : "Operacional"}
          </span>
        </div>

        {params.success ? <p className="success">Configuração guardada.</p> : null}
        {params.error ? <p className="error">Não foi possível guardar a configuração.</p> : null}

        <form className="system-settings-card" action="/api/system-settings" method="post">
          <label className="checkbox">
            <input type="checkbox" name="maintenanceMode" defaultChecked={settings.maintenanceMode} />
            Ativar modo manutenção
          </label>
          <p className="muted">
            Quando ativo, professores e receção conseguem consultar dados já registados, mas não conseguem lançar pagamentos,
            marcações ou anulações. Administradores continuam com acesso total.
          </p>
          <button className="button" type="submit">
            Guardar configuração
          </button>
        </form>
      </section>
    </AppShell>
  );
}
