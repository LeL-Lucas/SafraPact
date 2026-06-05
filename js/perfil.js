"use strict";

window.addEventListener("DOMContentLoaded", () => {
    const session = SafraPact.getSession();
    if (!session) { window.location.href = "index.html"; return; }
    SafraPact.initCommon();
    document.getElementById("perfil-nome").innerText = session.nome;
    document.getElementById("perfil-tipo").innerText = session.tipo;
    document.getElementById("perfil-email").innerText = session.email;
    document.getElementById("nav-usuario").innerText = session.nome;

    const menuMural = document.getElementById("menu-item-mural");
    const actions = document.getElementById("perfil-actions");
    const mainCard = document.querySelector(".profile-card");
    if (session.tipo === "Produtor Rural") {
        if (menuMural) menuMural.style.display = "none";
        actions.innerHTML = '<button class="btn-primary" id="perfil-publicar-demanda"><i class="fas fa-plus"></i> Nova Demanda</button>';
        mainCard.insertAdjacentHTML("beforeend", `
          <section class="profile-section" id="pending-section">
            <div class="profile-section-head"><div><h2>Demandas pendentes</h2><small>Rascunhos confirmados, mas ainda não publicados.</small></div><span class="status-tag" id="pending-count">0 pendentes</span></div>
            <div class="pending-list" id="pending-list"></div>
          </section>`);
        SafraPact.initDemandModal();
        renderPending(session.email);
        window.addEventListener("safrapact:pending-change", () => renderPending(session.email));
    } else {
        actions.innerHTML = '<a class="btn-primary" href="propostas.html"><i class="fas fa-map-location-dot"></i> Explorar Oportunidades</a>';
        SafraPact.initProviderNotifications();
    }
    mainCard.insertAdjacentHTML("beforeend", `<div class="sync-status-card"><i class="fas ${SafraPact.isRemoteSyncEnabled() ? "fa-cloud" : "fa-mobile-screen"}"></i>${SafraPact.isRemoteSyncEnabled() ? "Sincronização entre dispositivos ativa" : "Modo local ativo neste navegador"}</div>`);
    document.getElementById("btn-sair").addEventListener("click", () => { SafraPact.logout(); window.location.href = "index.html"; });
});

function renderPending(email) {
    const list = document.getElementById("pending-list");
    const counter = document.getElementById("pending-count");
    if (!list || !counter) return;
    const pending = SafraPact.getPending(email);
    counter.innerText = `${pending.length} pendente${pending.length === 1 ? "" : "s"}`;
    list.innerHTML = pending.length ? pending.map(item => `
      <div class="pending-item">
        <div><strong>${SafraPact.escapeHtml(item.titulo)}</strong><small>${SafraPact.escapeHtml(item.localizacao || "Localização a confirmar")} · ${SafraPact.escapeHtml(item.area || "Área a confirmar")}</small></div>
        <div class="pending-item-actions"><button class="btn-secondary btn-mini btn-editar-pendente" data-id="${item.id}"><i class="fas fa-pen"></i> Revisar</button><button class="btn-primary btn-mini btn-publicar-pendente" data-id="${item.id}"><i class="fas fa-paper-plane"></i> Publicar</button></div>
      </div>`).join("") : '<div class="notification-empty">Nenhuma demanda pendente. Utilize “Nova Demanda” para criar uma oportunidade.</div>';
    list.querySelectorAll(".btn-editar-pendente").forEach(button => button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("safrapact:edit-pending", { detail: pending.find(item => item.id === button.dataset.id) }))));
    list.querySelectorAll(".btn-publicar-pendente").forEach(button => button.addEventListener("click", async () => {
        const item = pending.find(current => current.id === button.dataset.id);
        if (!item) return;
        if (!isPublishable(item)) { SafraPact.toast("Revise a demanda e preencha os campos obrigatórios antes de publicar.", "notice"); window.dispatchEvent(new CustomEvent("safrapact:edit-pending", { detail: item })); return; }
        await SafraPact.publishDemand({ ...item, id: undefined });
        SafraPact.removePendingDemand(email, item.id);
        SafraPact.toast("Demanda pendente publicada para os prestadores.");
        renderPending(email);
    }));
}
function isPublishable(item) { return item.titulo && item.tipo && item.cidade && item.uf && item.area && item.inicio && item.fim; }
