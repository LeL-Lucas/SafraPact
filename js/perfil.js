"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    SafraPact.initCommon();
    const session = SafraPact.getSession();
    if (!session) { window.location.href = "index.html"; return; }
    document.getElementById("perfil-nome").innerText = session.nome;
    document.getElementById("perfil-tipo").innerText = session.tipo;
    document.getElementById("perfil-email").innerText = session.email;
    document.getElementById("nav-usuario").innerText = session.nome;
    const menuMural = document.getElementById("menu-item-mural");
    const actions = document.getElementById("perfil-actions");
    const card = document.querySelector(".profile-card");
    if (session.tipo === "Produtor Rural") {
        if (menuMural) menuMural.style.display = "none";
        actions.innerHTML = '<button class="btn-primary" id="perfil-publicar-demanda"><i class="fas fa-plus"></i> Nova Demanda</button>';
        card.insertAdjacentHTML("beforeend", `<section class="profile-section"><div class="profile-section-head"><div><h2>Demandas pendentes</h2><small>Itens salvos para revisão antes da publicação.</small></div><span class="status-tag" id="pending-count">0 pendentes</span></div><div class="pending-list" id="pending-list"></div></section><section class="profile-section"><div class="profile-section-head"><div><h2>Demandas publicadas</h2><small>Edite ou exclua ofertas já sincronizadas com os prestadores.</small></div><span class="status-tag" id="published-count">0 publicadas</span></div><div class="pending-list" id="published-list"></div></section>`);
        SafraPact.initDemandModal();
        await renderPending(session.email);
        await renderPublished(session.email);
        window.addEventListener("safrapact:pending-change", () => renderPending(session.email));
        window.addEventListener("safrapact:published-change", () => renderPublished(session.email));
    } else {
        actions.innerHTML = '<a class="btn-primary" href="propostas.html"><i class="fas fa-map-location-dot"></i> Explorar oportunidades</a>';
        SafraPact.initProviderNotifications();
    }
    card.insertAdjacentHTML("beforeend", `<div class="sync-status-card"><i class="fas ${SafraPact.isRemoteSyncEnabled() ? "fa-cloud" : "fa-mobile-screen"}"></i>${SafraPact.isRemoteSyncEnabled() ? "Firebase ativo: demandas sincronizadas entre aparelhos" : "Modo local ativo neste navegador"}</div>`);
});

async function renderPending(email) {
    const list = document.getElementById("pending-list"), counter = document.getElementById("pending-count"); if (!list || !counter) return;
    const pending = await SafraPact.loadPending(email); counter.innerText = `${pending.length} pendente${pending.length === 1 ? "" : "s"}`;
    list.innerHTML = pending.length ? pending.map(item => `<div class="pending-item"><div><strong>${SafraPact.escapeHtml(item.titulo || "Demanda sem título")}</strong><small>${SafraPact.escapeHtml(item.localizacao || "Localização a confirmar")} · ${SafraPact.escapeHtml(item.area || "Área a confirmar")}</small></div><div class="pending-item-actions"><button class="btn-secondary btn-mini btn-editar-pendente" data-id="${item.id}"><i class="fas fa-pen"></i> Revisar</button><button class="btn-secondary btn-mini btn-excluir-pendente" data-id="${item.id}"><i class="fas fa-trash"></i> Excluir</button><button class="btn-primary btn-mini btn-publicar-pendente" data-id="${item.id}"><i class="fas fa-paper-plane"></i> Publicar</button></div></div>`).join("") : '<div class="notification-empty">Nenhuma demanda pendente.</div>';
    list.querySelectorAll(".btn-editar-pendente").forEach(button => button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("safrapact:edit-pending", { detail: pending.find(item => item.id === button.dataset.id) }))));
    list.querySelectorAll(".btn-excluir-pendente").forEach(button => button.addEventListener("click", async () => { if (!confirm("Excluir esta demanda pendente?")) return; await SafraPact.removePendingDemand(email, button.dataset.id); SafraPact.toast("Demanda pendente excluída."); renderPending(email); }));
    list.querySelectorAll(".btn-publicar-pendente").forEach(button => button.addEventListener("click", async () => { const item = pending.find(current => current.id === button.dataset.id); if (!item) return; if (!isPublishable(item)) { SafraPact.toast("Revise os campos obrigatórios antes de publicar.", "error"); window.dispatchEvent(new CustomEvent("safrapact:edit-pending", { detail: item })); return; } await SafraPact.publishDemand({ ...item, id: undefined }); await SafraPact.removePendingDemand(email, item.id); SafraPact.toast("Demanda publicada para os prestadores."); renderPending(email); renderPublished(email); }));
}

async function renderPublished(email) {
    const list = document.getElementById("published-list"), counter = document.getElementById("published-count"); if (!list || !counter) return;
    const all = await SafraPact.getPublishedDemands(); const published = all.filter(item => item.ownerEmail === email); counter.innerText = `${published.length} publicada${published.length === 1 ? "" : "s"}`;
    list.innerHTML = published.length ? published.map(item => `<div class="pending-item"><div><strong>${SafraPact.escapeHtml(item.titulo)}</strong><small>${SafraPact.escapeHtml(item.localizacao)} · ${SafraPact.escapeHtml(item.area)}</small></div><div class="pending-item-actions"><button class="btn-secondary btn-mini btn-editar-publicada" data-id="${item.id}"><i class="fas fa-pen"></i> Editar</button><button class="btn-secondary btn-mini btn-excluir-publicada" data-id="${item.id}"><i class="fas fa-trash"></i> Excluir</button></div></div>`).join("") : '<div class="notification-empty">Nenhuma demanda publicada por esta conta.</div>';
    list.querySelectorAll(".btn-editar-publicada").forEach(button => button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("safrapact:edit-published", { detail: published.find(item => item.id === button.dataset.id) }))));
    list.querySelectorAll(".btn-excluir-publicada").forEach(button => button.addEventListener("click", async () => { if (!confirm("Excluir esta demanda publicada? Ela deixará de aparecer para os prestadores.")) return; try { await SafraPact.deletePublishedDemand(button.dataset.id); SafraPact.toast("Demanda publicada excluída."); renderPublished(email); } catch (_) { SafraPact.toast("Não foi possível excluir no Firebase.", "error"); } }));
}
function isPublishable(item) { return item.titulo && item.tipo && item.cidade && item.uf && item.area && item.inicio && item.fim; }
