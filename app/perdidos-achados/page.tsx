import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LostFoundTab = "register" | "open" | "alerts" | "director" | "history";

function dateTimeInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function daysSince(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    closed_director: "Fechado pelo diretor",
    delivered_director: "Entregue ao diretor",
    delivered_user: "Entregue ao utente",
    in_reception: "Em receção"
  };
  return labels[status] || status;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    closed_director: "Fechado pelo diretor",
    created: "Registado",
    delivered_director: "Entregue ao diretor",
    delivered_user: "Entregue ao utente"
  };
  return labels[action] || action;
}

function tabHref(tab: LostFoundTab) {
  return `/perdidos-achados?tab=${tab}`;
}

export default async function LostFoundPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const roles = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isReception = hasRole(user, "recepcao");

  if (!isAdmin && !isReception) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const activeTab: LostFoundTab =
    params.tab === "alerts" || params.tab === "director" || params.tab === "history" || params.tab === "open" ? params.tab : "register";
  const items = await prisma.lostFoundItem.findMany({
    orderBy: [{ foundAt: "desc" }, { createdAt: "desc" }],
    include: {
      logs: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "asc" } }
    }
  });
  const openItems = items.filter((item) => item.status === "in_reception");
  const alertItems = openItems.filter((item) => item.valuable && daysSince(item.foundAt) >= 7);
  const directorItems = items.filter((item) => item.status === "delivered_director");
  const historyItems = items.filter((item) => item.status === "delivered_user" || item.status === "closed_director");

  const visibleItems =
    activeTab === "alerts" ? alertItems : activeTab === "director" ? directorItems : activeTab === "history" ? historyItems : openItems;

  return (
    <AppShell userName={user.name} roles={roles}>
      <section className="page-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Receção</p>
            <h1>Perdidos e achados</h1>
            <p className="muted">Regista itens encontrados, acompanha alertas de 7 dias e fecha entregas.</p>
          </div>
          <span className="status">{items.length} registos</span>
        </div>

        {params.success ? <p className="success">Operação registada com sucesso.</p> : null}
        {params.error === "required" ? <p className="error">Preenche os campos obrigatórios.</p> : null}
        {params.error === "photo" ? <p className="error">A fotografia deve ser JPG, PNG ou WebP e ter no máximo 5 MB.</p> : null}
        {params.error === "photo-count" ? <p className="error">Podes adicionar no máximo 5 fotografias por item.</p> : null}
        {params.error === "cloudinary" ? <p className="error">Cloudinary não está configurado. Confirma as variáveis de ambiente.</p> : null}
        {params.error && !["required", "photo", "photo-count", "cloudinary"].includes(params.error) ? <p className="error">Não foi possível concluir a operação.</p> : null}

        <div className="tabs">
          <a className={activeTab === "register" ? "tab active" : "tab"} href={tabHref("register")}>
            Registar
          </a>
          <a className={activeTab === "open" ? "tab active" : "tab"} href={tabHref("open")}>
            Em receção
          </a>
          <a className={activeTab === "alerts" ? "tab active" : "tab"} href={tabHref("alerts")}>
            Alertas 7 dias
          </a>
          <a className={activeTab === "director" ? "tab active" : "tab"} href={tabHref("director")}>
            Entregues ao diretor
          </a>
          <a className={activeTab === "history" ? "tab active" : "tab"} href={tabHref("history")}>
            Histórico
          </a>
        </div>

        {activeTab === "register" ? (
          <form className="lost-found-form" action="/api/lost-found" method="post" encType="multipart/form-data">
            <div className="field">
              <label htmlFor="foundAt">Data e hora encontrado</label>
              <input id="foundAt" name="foundAt" type="datetime-local" defaultValue={dateTimeInputValue()} required />
            </div>
            <div className="field">
              <label htmlFor="foundBy">Encontrado por</label>
              <input id="foundBy" name="foundBy" required />
            </div>
            <div className="field">
              <label>Entregue a quem na receção</label>
              <div className="readonly-field">{user.name}</div>
            </div>
            <div className="field">
              <label htmlFor="location">Local encontrado</label>
              <input id="location" name="location" required />
            </div>
            <div className="field lost-found-description">
              <label htmlFor="description">Descrição do item</label>
              <textarea id="description" name="description" rows={3} required />
            </div>
            <div className="field">
              <label htmlFor="photos">Fotografias</label>
              <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple />
              <small className="muted">Até 5 fotografias.</small>
            </div>
            <label className="checkbox lost-found-check">
              <input type="checkbox" name="valuable" />
              Item de valor
            </label>
            <button className="button" type="submit">
              Registar item
            </button>
          </form>
        ) : (
          <div className="lost-found-list">
            {visibleItems.length === 0 ? <p className="muted">Sem itens neste separador.</p> : null}
            {visibleItems.map((item) => {
              const itemDays = daysSince(item.foundAt);
              const isOverdue = item.valuable && item.status === "in_reception" && itemDays >= 7;
              const photoSources = item.photos.length
                ? item.photos.map((photo) => photo.url)
                : [item.photoUrl || item.photoDataUrl].filter((photo): photo is string => Boolean(photo));
              const photoSource = photoSources[0];

              return (
                <article className={`lost-found-item ${isOverdue ? "overdue" : ""}`} key={item.id}>
                  <div className="lost-found-gallery">
                    {photoSource ? (
                      <a href={photoSource} target="_blank" rel="noreferrer" title="Abrir fotografia maior">
                        <img alt={`Fotografia de ${item.description}`} src={photoSource} />
                      </a>
                    ) : (
                      <div className="lost-found-photo-empty">Sem foto</div>
                    )}
                    {photoSources.length > 1 ? (
                      <div className="lost-found-thumbnails">
                        {photoSources.map((source, index) => (
                          <a href={source} key={source} target="_blank" rel="noreferrer" title="Abrir fotografia maior">
                            <img alt={`Fotografia ${index + 1} de ${item.description}`} src={source} />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="lost-found-main">
                    <div className="lost-found-title">
                      <div>
                        <strong>{item.description}</strong>
                        <span>{item.location || "Local não indicado"}</span>
                      </div>
                      <span className={isOverdue ? "status inactive" : "status active"}>{statusLabel(item.status)}</span>
                    </div>
                    <div className="lost-found-meta">
                      <span>Encontrado: {item.foundAt.toLocaleString("pt-PT")}</span>
                      <span>Por: {item.foundBy}</span>
                      <span>Receção: {item.receptionReceiver}</span>
                      <span>{item.valuable ? `Valor - ${itemDays} dia(s)` : `${itemDays} dia(s)`}</span>
                    </div>
                    {isOverdue ? <p className="error compact-message">Item de valor com 7 ou mais dias. Deve ser entregue ao diretor.</p> : null}
                    {item.status === "delivered_user" ? <p className="muted">Entregue ao utente: {item.deliveredToUserName}</p> : null}
                    {item.status === "closed_director" ? <p className="muted">Motivo de fecho: {item.directorCloseReason}</p> : null}
                    <details className="lost-found-logs">
                      <summary>Histórico</summary>
                      {item.logs.map((log) => (
                        <p key={log.id}>
                          {log.createdAt.toLocaleString("pt-PT")} - {actionLabel(log.action)} por {log.actionByName}
                          {log.details ? ` - ${log.details}` : ""}
                        </p>
                      ))}
                    </details>
                  </div>
                  <div className="lost-found-actions">
                    {item.status === "in_reception" ? (
                      <>
                        <form action={`/api/lost-found/${item.id}`} method="post">
                          <input type="hidden" name="action" value="deliver-user" />
                          <input name="deliveredToUserName" placeholder="Nome do utente" required />
                          <button className="button secondary" type="submit">
                            Entregar ao utente
                          </button>
                        </form>
                        <form action={`/api/lost-found/${item.id}`} method="post">
                          <input type="hidden" name="action" value="deliver-director" />
                          <button className="button danger" type="submit">
                            Entregar ao diretor
                          </button>
                        </form>
                      </>
                    ) : null}
                    {isAdmin && item.status === "delivered_director" ? (
                      <form action={`/api/lost-found/${item.id}`} method="post">
                        <input type="hidden" name="action" value="close-director" />
                        <textarea name="directorCloseReason" placeholder="Motivo de fecho" rows={3} required />
                        <button className="button" type="submit">
                          Fechar ticket
                        </button>
                      </form>
                    ) : null}
                    {isAdmin ? (
                      <form action={`/api/lost-found/${item.id}`} method="post">
                        <input type="hidden" name="action" value="delete" />
                        <button className="button danger" type="submit">
                          Eliminar registo
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
