import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  return (
    <AppShell userName={user.name}>
      <section className="panel">
        <p className="eyebrow">Conta</p>
        <h1>A minha conta</h1>
        <p className="muted">{user.email}</p>

        <form className="form account-form" action="/api/account/password" method="post">
          <div className="field">
            <label htmlFor="currentPassword">Password atual</label>
            <input id="currentPassword" name="currentPassword" type="password" required />
          </div>
          <div className="field">
            <label htmlFor="newPassword">Nova password</label>
            <input id="newPassword" name="newPassword" type="password" required minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirmar nova password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} />
          </div>
          {params.success ? <p className="success">Password alterada com sucesso.</p> : null}
          {params.error ? <p className="error">Confirma a password atual e tenta novamente.</p> : null}
          <button className="button" type="submit">
            Alterar password
          </button>
        </form>
      </section>
    </AppShell>
  );
}
