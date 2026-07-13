import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function RecoverPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;

  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-box">
        <p className="eyebrow">Plataforma de Gestão</p>
        <h1>Recuperar password</h1>
        <p className="muted">Indica o teu email para receberes um link de recuperação.</p>
        <form className="form" action="/api/auth/password-reset/request" method="post">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          {params.sent ? <p className="success">Se o email existir, enviámos um link de recuperação.</p> : null}
          {params.error ? <p className="error">Não foi possível enviar o email. Tenta novamente mais tarde.</p> : null}
          <button className="button" type="submit">
            Enviar recuperação
          </button>
        </form>
        <Link className="auth-link" href="/login">
          Voltar ao login
        </Link>
      </section>
    </main>
  );
}
