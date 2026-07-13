import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;

  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-box">
        <p className="eyebrow">Plataforma de Gestão</p>
        <h1>Entrar</h1>
        <p className="muted">Acede às ferramentas autorizadas para a tua função.</p>
        <form className="form" action="/api/auth/login" method="post">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          {params.error ? <p className="error">Email ou password inválidos.</p> : null}
          <button className="button" type="submit">
            Entrar
          </button>
        </form>
        <Link className="auth-link" href="/recuperar-password">
          Esqueci-me da password
        </Link>
      </section>
    </main>
  );
}
