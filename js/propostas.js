"use strict";

const USUARIOS_DEMO = [
    { email: "produtor@safra.com.br", senha: "123", tipo: "Produtor Rural", nome: "Fazenda Progresso" },
    { email: "empresa@agro.com.br", senha: "123", tipo: "Empresa Prestadora", nome: "Logística & Colheita Agro" }
];
const NOMES_ESTADOS = {
    AC:"Acre (AC)",AL:"Alagoas (AL)",AP:"Amapá (AP)",AM:"Amazonas (AM)",BA:"Bahia (BA)",CE:"Ceará (CE)",DF:"Distrito Federal (DF)",ES:"Espírito Santo (ES)",GO:"Goiás (GO)",MA:"Maranhão (MA)",MT:"Mato Grosso (MT)",MS:"Mato Grosso do Sul (MS)",MG:"Minas Gerais (MG)",PA:"Pará (PA)",PB:"Paraíba (PB)",PR:"Paraná (PR)",PE:"Pernambuco (PE)",PI:"Piauí (PI)",RJ:"Rio de Janeiro (RJ)",RN:"Rio Grande do Norte (RN)",RS:"Rio Grande do Sul (RS)",RO:"Rondônia (RO)",RR:"Roraima (RR)",SC:"Santa Catarina (SC)",SP:"São Paulo (SP)",SE:"Sergipe (SE)",TO:"Tocantins (TO)"
};
let demandas = [];
let estadoMapa = "MT";

window.addEventListener("DOMContentLoaded", async () => {
    SafraPact.initCommon();
    configurarModaisBase();
    configurarLogin();
    aplicarSessao();
    inserirFiltros();
    inicializarMapa();
    demandas = await SafraPact.getPublishedDemands();
    renderizar();
    SafraPact.initProviderNotifications();
    window.addEventListener("safrapact:update", async () => { demandas = await SafraPact.getPublishedDemands(); renderizar(); });
});

function abrirModal(id) { const modal = document.getElementById(id); if (modal) modal.style.display = "flex"; }
function fecharModal(id) { const modal = document.getElementById(id); if (modal) modal.style.display = "none"; }

function aplicarSessao() {
    const sessao = SafraPact.getSession();
    const navLogin = document.getElementById("nav-login");
    const navCadastro = document.getElementById("nav-cadastro");
    if (navLogin) {
        navLogin.textContent = sessao ? sessao.nome : "Login";
        navLogin.addEventListener("click", () => sessao ? (window.location.href = "perfil.html") : abrirModal("modalLoginOverlay"));
    }
    if (navCadastro) navCadastro.style.display = sessao ? "none" : "";
    if (sessao?.tipo === "Produtor Rural") window.location.href = "perfil.html";
    if (!sessao) abrirModal("modalLoginOverlay");
}

function configurarLogin() {
    const botao = document.getElementById("btn-efetuar-login");
    const email = document.getElementById("login-email");
    const senha = document.getElementById("login-senha");
    const erro = document.getElementById("login-error-msg");
    if (!botao || !email || !senha) return;
    const autenticar = () => {
        if (erro) erro.style.display = "none";
        const usuario = USUARIOS_DEMO.find(item => item.email === email.value.trim().toLowerCase() && item.senha === senha.value);
        if (!usuario) { if (erro) { erro.textContent = "E-mail corporativo ou senha incorretos."; erro.style.display = "block"; } return; }
        SafraPact.saveSession(usuario);
        if (usuario.tipo === "Produtor Rural") { window.location.href = "perfil.html"; return; }
        fecharModal("modalLoginOverlay");
        window.location.reload();
    };
    botao.addEventListener("click", autenticar);
    senha.addEventListener("keydown", event => { if (event.key === "Enter") autenticar(); });
}

function configurarModaisBase() {
    document.getElementById("nav-cadastro")?.addEventListener("click", () => abrirModal("modalRegisterOverlay"));
    document.getElementById("nav-prazos")?.addEventListener("click", () => abrirModal("modalPrazosOverlay"));
    document.getElementById("link-mudar-cadastro")?.addEventListener("click", () => { fecharModal("modalLoginOverlay"); abrirModal("modalRegisterOverlay"); });
    document.getElementById("close-login")?.addEventListener("click", () => fecharModal("modalLoginOverlay"));
    document.getElementById("close-cadastro")?.addEventListener("click", () => fecharModal("modalRegisterOverlay"));
    document.getElementById("close-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("btn-entendi-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("close-detalhes")?.addEventListener("click", () => fecharModal("modalOverlay"));
    window.addEventListener("click", event => {
        ["modalOverlay","modalLoginOverlay","modalRegisterOverlay","modalPrazosOverlay"].forEach(id => { const modal = document.getElementById(id); if (event.target === modal) fecharModal(id); });
    });
}

function inserirFiltros() {
    const lista = document.getElementById("muralGeralLista");
    if (!lista || document.getElementById("mural-filter-panel")) return;
    lista.insertAdjacentHTML("beforebegin", `
      <div class="mural-filter-panel" id="mural-filter-panel">
        <input class="premium-input" id="filtro-texto" placeholder="Pesquisar serviço, cidade, cultura ou descrição">
        <select class="premium-input" id="filtro-tipo"><option value="">Todos os serviços</option><option>Colheita</option><option>Plantio</option><option>Pulverização</option><option>Preparo do solo</option><option>Transporte e logística</option><option>Aplicação de fertilizantes</option><option>Locação de maquinário</option><option>Outro serviço</option></select>
        <select class="premium-input" id="filtro-uf"><option value="">Todos os estados</option>${Object.keys(NOMES_ESTADOS).map(uf => `<option value="${uf}">${uf}</option>`).join("")}</select>
        <div class="filter-actions"><button class="btn-primary" id="btn-ver-todas" type="button">Ver todas</button><button class="btn-secondary" id="btn-limpar-filtros" type="button">Limpar</button></div>
      </div>`);
    ["filtro-texto","filtro-tipo","filtro-uf"].forEach(id => document.getElementById(id)?.addEventListener("input", renderizar));
    document.getElementById("btn-ver-todas")?.addEventListener("click", () => { estadoMapa = ""; document.querySelectorAll(".state-selected").forEach(el => el.classList.remove("state-selected")); document.getElementById("estadoAtual").textContent = "Todos os estados"; document.getElementById("tituloMural").textContent = "Todas as propostas disponíveis"; renderizar(); });
    document.getElementById("btn-limpar-filtros")?.addEventListener("click", () => { document.getElementById("filtro-texto").value=""; document.getElementById("filtro-tipo").value=""; document.getElementById("filtro-uf").value=""; renderizar(); });
}

function inicializarMapa() {
    const estados = document.querySelectorAll(".brazil-svg-map .state[id]");
    estados.forEach(estado => {
        const uf = estado.id.toUpperCase();
        estado.setAttribute("tabindex","0"); estado.setAttribute("role","button"); estado.setAttribute("aria-label",`Selecionar ${NOMES_ESTADOS[uf] || uf}`);
        const selecionar = () => {
            estados.forEach(item => item.classList.remove("state-selected"));
            estado.classList.add("state-selected");
            estadoMapa = uf;
            document.getElementById("estadoAtual").textContent = NOMES_ESTADOS[uf] || uf;
            document.getElementById("tituloMural").textContent = `Propostas Disponíveis: ${NOMES_ESTADOS[uf] || uf}`;
            renderizar();
        };
        estado.addEventListener("click", selecionar);
        estado.addEventListener("keydown", event => { if (["Enter"," "].includes(event.key)) { event.preventDefault(); selecionar(); } });
    });
    document.getElementById("MT")?.classList.add("state-selected");
}

function renderizar() {
    const container = document.getElementById("muralGeralLista");
    if (!container) return;
    const texto = (document.getElementById("filtro-texto")?.value || "").trim().toLowerCase();
    const tipo = document.getElementById("filtro-tipo")?.value || "";
    const ufFiltro = document.getElementById("filtro-uf")?.value || "";
    const itens = demandas.filter(item => {
        const alvo = [item.titulo,item.tipo,item.cultura,item.cidade,item.localizacao,item.descricao].join(" ").toLowerCase();
        return (!estadoMapa || item.uf === estadoMapa) && (!ufFiltro || item.uf === ufFiltro) && (!tipo || item.tipo === tipo) && (!texto || alvo.includes(texto));
    });
    if (!itens.length) {
        container.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-muted);">Nenhuma proposta encontrada. Ajuste os filtros ou clique em “Ver todas”.</div>';
        return;
    }
    container.innerHTML = itens.map(item => `
      <article class="contract-card">
        <img src="${SafraPact.escapeHtml(item.imagem || "img/servico-agro-placeholder.svg")}" alt="${SafraPact.escapeHtml(item.tipo)}" class="contract-img" onerror="this.onerror=null;this.src='img/servico-agro-placeholder.svg';">
        <div class="contract-body">
          <div class="card-tags"><span class="status-tag">${SafraPact.escapeHtml(item.tipo)}</span><span class="loc-text"><i class="fas fa-map-marker-alt"></i> ${SafraPact.escapeHtml(item.localizacao)}</span></div>
          <h3>${SafraPact.escapeHtml(item.titulo)}</h3>
          <div class="card-extra-meta">${item.cultura ? `<span><i class="fas fa-seedling"></i> ${SafraPact.escapeHtml(item.cultura)}</span>` : ""}${item.prioridade ? `<span><i class="fas fa-clock"></i> ${SafraPact.escapeHtml(item.prioridade)}</span>` : ""}</div>
          <div class="metrics-grid"><div class="metric"><span>Tamanho da Área</span><strong>${SafraPact.escapeHtml(item.area)}</strong></div><div class="metric"><span>Janela Trabalho</span><strong>${SafraPact.escapeHtml(item.janela)}</strong></div></div>
          <button class="btn-secondary btn-block btn-detalhes-mural" data-id="${SafraPact.escapeHtml(item.id)}">Ver Detalhes</button>
        </div>
      </article>`).join("");
    container.querySelectorAll(".btn-detalhes-mural").forEach(botao => botao.addEventListener("click", () => abrirDetalhes(botao.dataset.id)));
}

function abrirDetalhes(id) {
    const item = demandas.find(demanda => String(demanda.id) === String(id));
    if (!item) return;
    document.getElementById("modalNome").textContent = item.titulo;
    document.getElementById("modalCargo").innerHTML = `<i class="fas fa-map-marker-alt"></i> ${SafraPact.escapeHtml(item.localizacao)}`;
    document.getElementById("modalExp").textContent = item.area;
    document.getElementById("modalEsp").textContent = item.janela;
    abrirModal("modalOverlay");
}
