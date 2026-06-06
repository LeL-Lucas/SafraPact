"use strict";

let demandas = [];
let ufSelecionada = "MT";
let mostrarTodas = false;

const nomesEstados = {
    AC: "Acre (AC)", AL: "Alagoas (AL)", AP: "Amapá (AP)", AM: "Amazonas (AM)", BA: "Bahia (BA)", CE: "Ceará (CE)", DF: "Distrito Federal (DF)", ES: "Espírito Santo (ES)", GO: "Goiás (GO)", MA: "Maranhão (MA)", MT: "Mato Grosso (MT)", MS: "Mato Grosso do Sul (MS)", MG: "Minas Gerais (MG)", PA: "Pará (PA)", PB: "Paraíba (PB)", PR: "Paraná (PR)", PE: "Pernambuco (PE)", PI: "Piauí (PI)", RJ: "Rio de Janeiro (RJ)", RN: "Rio Grande do Norte (RN)", RS: "Rio Grande do Sul (RS)", RO: "Rondônia (RO)", RR: "Roraima (RR)", SC: "Santa Catarina (SC)", SP: "São Paulo (SP)", SE: "Sergipe (SE)", TO: "Tocantins (TO)"
};

document.addEventListener("DOMContentLoaded", async () => {
    SafraPact.initCommon();
    configurarModaisBase();
    configurarLogin();
    if (!validarAcesso()) return;
    inserirFiltros();
    inicializarMapa();
    demandas = await SafraPact.getPublishedDemands();
    renderizar();
    SafraPact.onDemandsChange(items => { demandas = items; renderizar(); });
    const oferta = new URLSearchParams(location.search).get("oferta");
    if (oferta) abrirDetalhes(oferta);
});

function abrirModal(id) { const modal = document.getElementById(id); if (modal) modal.style.display = "flex"; }
function fecharModal(id) { const modal = document.getElementById(id); if (modal) modal.style.display = "none"; }
function validarAcesso() {
    const sessao = SafraPact.getSession();
    if (sessao?.tipo === "Produtor Rural") { window.location.href = "perfil.html"; return false; }
    if (!sessao) { document.body.classList.add("propostas-locked"); abrirModal("modalLoginOverlay"); return false; }
    return true;
}
function configurarLogin() {
    document.getElementById("btn-efetuar-login")?.addEventListener("click", () => {
        const user = SafraPact.authenticate(document.getElementById("login-email")?.value, document.getElementById("login-senha")?.value);
        const erro = document.getElementById("login-error-msg");
        if (!user || user.tipo !== "Empresa Prestadora") { if (erro) { erro.innerText = "Acesse com uma conta de empresa prestadora para consultar o mural."; erro.style.display = "block"; } return; }
        SafraPact.saveSession(user); window.location.reload();
    });
}
function configurarModaisBase() {
    document.getElementById("nav-cadastro")?.addEventListener("click", () => abrirModal("modalRegisterOverlay"));
    document.getElementById("nav-prazos")?.addEventListener("click", () => abrirModal("modalPrazosOverlay"));
    document.getElementById("close-login")?.addEventListener("click", () => fecharModal("modalLoginOverlay"));
    document.getElementById("close-cadastro")?.addEventListener("click", () => fecharModal("modalRegisterOverlay"));
    document.getElementById("close-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("btn-entendi-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("close-detalhes")?.addEventListener("click", () => fecharModal("modalOverlay"));
    document.getElementById("btn-fechar-detalhes")?.addEventListener("click", () => fecharModal("modalOverlay"));
    window.addEventListener("click", event => {
        ["modalLoginOverlay", "modalRegisterOverlay", "modalPrazosOverlay", "modalOverlay"].forEach(id => { const modal = document.getElementById(id); if (event.target === modal) fecharModal(id); });
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") ["modalLoginOverlay", "modalRegisterOverlay", "modalPrazosOverlay", "modalOverlay"].forEach(fecharModal);
    });
}
function inserirFiltros() {
    const header = document.querySelector(".mural-section-header"); if (!header || document.getElementById("mural-filters")) return;
    header.insertAdjacentHTML("afterend", `<div class="mural-filter-panel" id="mural-filters"><input class="premium-input" id="filtro-busca" placeholder="Pesquisar por serviço, cultura ou cidade"><select class="premium-input" id="filtro-tipo"><option value="">Todos os serviços</option><option>Colheita</option><option>Plantio</option><option>Pulverização</option><option>Preparo do solo</option><option>Transporte e logística</option><option>Aplicação de fertilizantes</option><option>Locação de maquinário</option><option>Outro serviço</option></select><select class="premium-input" id="filtro-uf"><option value="">Todos os estados</option>${Object.keys(nomesEstados).map(uf => `<option value="${uf}">${uf}</option>`).join("")}</select><div class="filter-actions"><button class="btn-primary" id="ver-todas" type="button">Ver todas</button><button class="btn-secondary" id="limpar-filtros" type="button">Limpar</button></div></div>`);
    ["filtro-busca", "filtro-tipo", "filtro-uf"].forEach(id => document.getElementById(id).addEventListener("input", renderizar));
    document.getElementById("ver-todas").addEventListener("click", () => { mostrarTodas = true; document.getElementById("filtro-uf").value = ""; renderizar(); });
    document.getElementById("limpar-filtros").addEventListener("click", () => { mostrarTodas = false; document.getElementById("filtro-busca").value = ""; document.getElementById("filtro-tipo").value = ""; document.getElementById("filtro-uf").value = ""; renderizar(); });
}
function inicializarMapa() {
    const estados = document.querySelectorAll(".brazil-svg-map .state[id]");
    estados.forEach(estado => {
        estado.setAttribute("tabindex", "0"); estado.setAttribute("role", "button"); estado.setAttribute("aria-label", `Selecionar ${nomesEstados[estado.id] || estado.id}`);
        const selecionar = () => { estados.forEach(item => item.classList.remove("state-selected")); estado.classList.add("state-selected"); ufSelecionada = estado.id; mostrarTodas = false; document.getElementById("estadoAtual").innerText = nomesEstados[ufSelecionada] || ufSelecionada; document.getElementById("filtro-uf").value = ""; renderizar(); };
        estado.addEventListener("click", selecionar); estado.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); selecionar(); } });
    });
    document.getElementById("MT")?.classList.add("state-selected");
}
function renderizar() {
    const container = document.getElementById("muralGeralLista"); if (!container) return;
    const busca = document.getElementById("filtro-busca")?.value.trim().toLowerCase() || "";
    const tipo = document.getElementById("filtro-tipo")?.value || "";
    const ufFiltro = document.getElementById("filtro-uf")?.value || "";
    const ufAtiva = mostrarTodas ? "" : (ufFiltro || ufSelecionada);
    const filtradas = demandas.filter(item => (!ufAtiva || item.uf === ufAtiva) && (!tipo || item.tipo === tipo) && (!busca || [item.titulo, item.tipo, item.cultura, item.localizacao, item.descricao].join(" ").toLowerCase().includes(busca)));
    document.getElementById("tituloMural").innerText = ufAtiva ? `Propostas Disponíveis: ${nomesEstados[ufAtiva] || ufAtiva}` : "Todas as propostas disponíveis";
    container.innerHTML = filtradas.length ? filtradas.map(item => `<article class="contract-card"><img src="${SafraPact.escapeHtml(item.imagem || "img/servico-agro-placeholder.svg")}" alt="${SafraPact.escapeHtml(item.tipo)}" class="contract-img" onerror="this.src='img/servico-agro-placeholder.svg'"><div class="contract-body"><div class="card-tags"><span class="status-tag">${SafraPact.escapeHtml(item.tipo)}</span><span class="loc-text"><i class="fas fa-map-marker-alt"></i> ${SafraPact.escapeHtml(item.localizacao)}</span></div><h3>${SafraPact.escapeHtml(item.titulo)}</h3><div class="card-extra-meta"><span><i class="fas fa-seedling"></i> ${SafraPact.escapeHtml(item.cultura || "Cultura a definir")}</span><span><i class="fas fa-flag"></i> ${SafraPact.escapeHtml(item.prioridade || "Planejamento normal")}</span></div><div class="metrics-grid"><div class="metric"><span>Tamanho da Área</span><strong>${SafraPact.escapeHtml(item.area)}</strong></div><div class="metric"><span>Janela Trabalho</span><strong>${SafraPact.escapeHtml(item.janela || `${SafraPact.formatDate(item.inicio)} a ${SafraPact.formatDate(item.fim)}`)}</strong></div></div><button class="btn-secondary btn-block btn-detalhes-mural" data-id="${SafraPact.escapeHtml(item.id)}">Ver Detalhes</button></div></article>`).join("") : '<div class="notification-empty empty-mural">Nenhuma proposta encontrada com os filtros atuais.</div>';
    container.querySelectorAll(".btn-detalhes-mural").forEach(button => button.addEventListener("click", () => abrirDetalhes(button.dataset.id)));
}
function abrirDetalhes(id) {
    const item = demandas.find(demanda => String(demanda.id) === String(id)); if (!item) return;
    document.getElementById("modalNome").innerText = item.titulo;
    document.getElementById("modalCargo").innerHTML = `<i class="fas fa-map-marker-alt"></i> ${SafraPact.escapeHtml(item.localizacao)}`;
    document.getElementById("modal-details-content").innerHTML = SafraPact.demandDetailsMarkup(item);
    abrirModal("modalOverlay");
}
