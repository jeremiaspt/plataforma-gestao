import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hashPasswordResetToken } from "@/lib/passwordResetEmail";
import { prisma } from "@/lib/prisma";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string; success?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;
  const token = String(params.token || "").trim();

  if (user) redirect("/dashboard");

  const tokenHash = token ? hashPasswordResetToken(token) : "";
  const resetToken = tokenHash
    ? await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true }
      })
    : null;
  const tokenIsValid = Boolean(
    resetToken &&
      resetToken.user.active &&
      !resetToken.usedAt &&
      resetToken.expiresAt.getTime() > Date.now()
  );

  return (
    <main className="login-page">
      <section className="login-box">
        <p className="eyebrow">gestao.gcp.ad - gestao operacional</p>
        <h1>Nova password</h1>
        {params.success ? (
          <>
            <p className="success">Password alterada com sucesso. Ja podes entrar.</p>
            <Link className="button" href="/login">
              Entrar
            </Link>
          </>
        ) : tokenIsValid ? (
          <form className="form" action="/api/auth/password-reset/confirm" method="post">
            <input type="hidden" name="token" value={token} />
            <div className="field">
              <label htmlFor="newPassword">Nova password</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirmar password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            {params.error ? <p className="error">Confirma se as passwords coincidem e tem pelo menos 8 caracteres.</p> : null}
            <button className="button" type="submit">
              Guardar nova password
            </button>
          </form>
        ) : (
          <>
            {token ? <p className="error">Este link ja nao e valido. Pede uma nova recuperacao de password.</p> : null}
            <form className="form" action="/redefinir-password" method="get">
              <div className="field">
                <label htmlFor="token">Codigo ou token de recuperacao</label>
                <input id="token" name="token" type="text" required autoComplete="one-time-code" />
              </div>
              <button className="button" type="submit">
                Continuar
              </button>
            </form>
            <Link href="/recuperar-password">Pedir novo link</Link>
          </>
        )}
      </section>
    </main>
  );
}
