/* Procedimento: regras de negócio, lógica e funcionalidades, em formato visual.
   Prazos e ações vêm dos dados servidos pela regra em Python (fonte única). */
import { GLOSSARY, LANE, PHASE } from "./terms.js";
import { compact, esc, fmt, fmtDate } from "./format.js";
import { state } from "./state.js";

const ACCOUNT_STEP = "Identificar e registrar a conta relacionada";
const SECTIONS = [
  ["visao", "Visão geral"],
  ["classificacao", "Classificação"],
  ["prazos", "Régua de prazos"],
  ["acoes", "O que fazer"],
  ["ordem", "Ordem dos cartões"],
  ["dashboard", "Indicadores"],
  ["funcionalidades", "Funcionalidades"],
  ["evidencia", "Por que essas regras"],
  ["glossario", "Glossário"],
  ["limites", "Limites"],
];
// Comparação com o método óbvio do desafio: ordenar só pelo valor.
const VARIANTS = [
  ["price_only_no_lanes", "Ordenar só pelo valor potencial"],
  ["focus_rule", "Lead Kanban"],
];

function sampleFor(phase) {
  const item = state.data.items.find((i) => i.phase === phase);
  return item ? { next: item.nextAction, steps: item.actions.filter((a) => a !== ACCOUNT_STEP) } : null;
}

function overview() {
  const { lanes } = state.data;
  return `
    <p class="lead">Três colunas, cada uma com uma tarefa. Dentro de cada coluna, os cartões já estão na ordem de atendimento.</p>
    <div class="lane-cards">
      ${lanes.map((l) => `
        <div class="lane-card" style="--lane:${LANE[l.id].color}">
          <h4><i class="lane-key"></i>${esc(l.title)}</h4>
          <p class="lane-card-rule">${esc(l.rule)}</p>
          <p>${{
            negociar: "Negócios com chance real de fechar agora. É a agenda principal da semana.",
            qualificar: "Oportunidades que ainda precisam provar necessidade, decisor e prazo.",
            encerrar: "Negócios parados além de qualquer prazo já observado. Confirmar com o cliente ou registrar a perda.",
          }[l.id]}</p>
        </div>`).join("")}
    </div>`;
}

function flow() {
  const max = state.data.reference.maxCycle;
  return `
    <p>Toda oportunidade passa por no máximo duas perguntas.</p>
    <div class="flow" role="img" aria-label="Fluxo de classificação: em prospecção vai para Qualificar; em negociação há até ${max} dias vai para Negociar; há mais de ${max} dias vai para Confirmar ou encerrar.">
      <div class="flow-node flow-start">Oportunidade aberta no CRM</div>
      <div class="flow-arrow"></div>
      <div class="flow-node flow-question">Qual a etapa no CRM?</div>
      <div class="flow-split">
        <div class="flow-branch">
          <span class="flow-label">Prospecção</span>
          <div class="flow-arrow"></div>
          <div class="flow-node flow-result" style="--lane:${LANE.qualificar.color}">Qualificar</div>
        </div>
        <div class="flow-branch flow-branch-wide">
          <span class="flow-label">Negociação</span>
          <div class="flow-arrow"></div>
          <div class="flow-node flow-question">Há quantos dias está em negociação?</div>
          <div class="flow-split">
            <div class="flow-branch">
              <span class="flow-label">até ${max} dias</span>
              <div class="flow-arrow"></div>
              <div class="flow-node flow-result" style="--lane:${LANE.negociar.color}">Negociar</div>
            </div>
            <div class="flow-branch">
              <span class="flow-label">mais de ${max} dias</span>
              <div class="flow-arrow"></div>
              <div class="flow-node flow-result" style="--lane:${LANE.encerrar.color}">Confirmar ou encerrar</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="note">Etapas do CRM: prospecção = <i>Prospecting</i>; negociação = <i>Engaging</i>. Conta pendente não muda a coluna.</p>`;
}

function ruler() {
  const { maxCycle: max, medianLost, medianWon, closed } = state.data.reference;
  const scale = max * 1.25; // espaço visual para "prazo excedido"
  const w = (from, to) => `${((to - from) / scale) * 100}%`;
  const segments = [
    ["Início", 0, 14, "0–14 dias"],
    ["Em andamento", 15, 89, "15–89 dias"],
    ["Perto do limite", 90, max, `90–${max} dias`],
  ];
  return `
    <p><strong>${max} dias</strong> é o maior tempo que uma das ${fmt(closed)} vendas concluídas levou para fechar. A fase indica o que fazer.</p>
    <div class="phase-ruler">
      <div class="phase-track">
        ${segments.map(([p, a, b]) => `<span class="phase-seg ${PHASE[p].tag}" style="width:${w(a, b + 1)}"></span>`).join("")}
        <span class="phase-seg tag-dark is-over" style="flex:1"></span>
        <i class="phase-mark" style="left:${(medianLost / scale) * 100}%"><em>${medianLost}d · mediana das perdas</em></i>
        <i class="phase-mark is-low" style="left:${(medianWon / scale) * 100}%"><em>${medianWon}d · mediana dos ganhos</em></i>
      </div>
      <div class="phase-legend">
        ${[...segments, ["Prazo excedido", max + 1, null, `mais de ${max} dias`]].map(([p, , , range]) => `
          <div><span class="tag ${PHASE[p].tag}">${p}</span><b>${range}</b><p>${esc(PHASE[p].hint)}</p></div>`).join("")}
      </div>
    </div>`;
}

function actions() {
  const rows = [
    ["qualificar", "Sem data", "Qualificar"],
    ["negociar", "Início", "Negociar · Início"],
    ["negociar", "Em andamento", "Negociar · Em andamento"],
    ["negociar", "Perto do limite", "Negociar · Perto do limite"],
    ["encerrar", "Prazo excedido", "Confirmar ou encerrar"],
  ];
  return `
    <p>Cada cartão traz a próxima ação e uma lista para marcar.</p>
    <div class="table-wrap">
      <table class="data-table help-table">
        <thead><tr><th>Situação</th><th>Próxima ação</th><th>Lista de verificação</th></tr></thead>
        <tbody>
          ${rows.map(([lane, phase, label]) => {
            const s = sampleFor(phase);
            return s ? `<tr><th scope="row"><i class="key" style="background:${LANE[lane].color}"></i>${label}</th><td>${esc(s.next)}</td><td><ul>${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></td></tr>` : "";
          }).join("")}
          <tr><th scope="row"><span class="tag tag-outline">Conta pendente</span></th><td>Acrescenta a tarefa de cadastro, em qualquer coluna.</td><td><ul><li>${ACCOUNT_STEP}</li></ul></td></tr>
        </tbody>
      </table>
    </div>`;
}

function ordering() {
  return `
    <ul class="checks">
      <li><strong>Negociar:</strong> maior valor potencial primeiro. No empate, o negócio mais recente, porque negócios novos resolveram mais e os antigos tenderam a travar.</li>
      <li><strong>Qualificar:</strong> maior valor potencial primeiro.</li>
      <li><strong>Confirmar ou encerrar:</strong> maior valor potencial primeiro, porque é o que mais distorce a previsão do pipeline. No empate, o mais antigo.</li>
      <li>O número <strong>#1, #2…</strong> no cartão é a posição dentro da coluna. A opção “Ordenar” muda a visualização, não a regra.</li>
    </ul>`;
}

function indicators() {
  return `
    <dl class="defs">
      <div><dt><i class="key" style="background:${LANE.negociar.color}"></i>Em negociação, no prazo</dt><dd>Valor somado da coluna Negociar.</dd></div>
      <div><dt><i class="key" style="background:${LANE.qualificar.color}"></i>A qualificar</dt><dd>Valor somado das oportunidades em prospecção.</dd></div>
      <div><dt><i class="key" style="background:${LANE.encerrar.color}"></i>A confirmar ou encerrar</dt><dd>Valor somado dos negócios com prazo excedido. Parece pipeline, mas está parado.</dd></div>
      <div><dt>Pipeline no prazo</dt><dd>De cada 100 em negociação, quanto ainda está dentro do prazo. Quanto maior, mais realista.</dd></div>
      <div><dt>Vendas ganhas e receita ganha</dt><dd>Histórico de vendas concluídas. Contexto de desempenho; não muda as colunas.</dd></div>
      <div><dt>Rankings</dt><dd>Por vendedor: mais valor para fechar, mais valor parado, menos pipeline no prazo e sem negociação ativa.</dd></div>
    </dl>`;
}

function features() {
  const list = [
    ["Filtros na barra superior", "Regional, manager, vendedor e busca valem para o Pipeline e para o Dashboard. Ficam salvos neste navegador."],
    ["Pipeline", "Três colunas com contagem, valor potencial e resumo. Mostra 25 cartões por vez; “Mostrar mais” carrega os próximos."],
    ["Cartão", "Posição, valor potencial, produto, conta, barra de prazo, fase, conta pendente, vendedor e progresso das ações."],
    ["Detalhe", "Clique no cartão: próximas ações, motivos da coluna, régua de prazo, dados da conta e histórico."],
    ["Lista de ações", "Marque o que já foi feito. O progresso fica salvo neste navegador; o CRM não é alterado."],
    ["Ordenar e contas pendentes", "Reordena por tempo em negociação ou mostra só oportunidades sem empresa cadastrada."],
    ["Dashboard", "KPIs, valor potencial por regional, manager ou vendedor, rankings e tabela ordenável."],
    ["Exportar CSV", "Pipeline e Dashboard exportam exatamente o recorte filtrado."],
    ["Atalhos", "? abre este procedimento · ← → navegam entre cartões no detalhe · Esc fecha."],
  ];
  return `<div class="feature-grid">${list.map(([t, d]) => `<div class="feature"><h4>${t}</h4><p>${d}</p></div>`).join("")}</div>`;
}

function evidence() {
  const { reference, backtest } = state.data;
  let table = "";
  if (backtest && backtest.length) {
    const totals = VARIANTS.map(([key, label]) => {
      const sum = (f) => backtest.reduce((acc, c) => acc + (c.top5[key]?.[f] || 0), 0);
      return { key, label, won: sum("won"), revenue: sum("won_revenue"), beyond: sum("beyond_cycle_slots") };
    });
    const exceeded = backtest.reduce((acc, c) => acc + c.cleanup.deals, 0);
    const closedLater = backtest.reduce((acc, c) => acc + c.cleanup.won + c.cleanup.lost, 0);
    table = `
      <p>Teste retroativo em ${backtest.length} datas de 2017 (${backtest.map((c) => fmtDate(c.cutoff).slice(0, 5)).join(", ")}), usando só o que se sabia em cada data. Cada método escolheu 5 negócios por vendedor; o desfecho foi observado até o fim dos dados.</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Método</th><th class="num">Vendas ganhas</th><th class="num">Receita ganha</th><th class="num">Escolhas com prazo excedido</th></tr></thead>
          <tbody>${totals.map((t) => `<tr class="${t.key === "focus_rule" ? "is-current" : ""}"><th scope="row">${t.label}</th><td class="num">${fmt(t.won)}</td><td class="num">${compact(t.revenue)}</td><td class="num">${fmt(t.beyond)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p>Dos ${fmt(exceeded)} casos que já tinham prazo excedido nas datas de teste, <strong>${fmt(closedLater)} fecharam depois</strong>.</p>
      ${robustness()}`;
  }
  return `
    <ul class="checks">
      <li>Produto, setor e vendedor quase não diferenciam ganhos de perdas: a taxa de ganho fica entre 60% e 65% na maioria dos recortes. Um modelo preditivo não superou a média (AUC 0,513).</li>
      <li>O tempo diferencia: perdas se decidem cedo (mediana de ${reference.medianLost} dias) e ganhos levam mais (mediana de ${reference.medianWon}). Nenhum negócio fechou depois de ${reference.maxCycle} dias.</li>
    </ul>
    ${table}`;
}

/* Controles de robustez do teste: desempate validado fora da seleção e prazos menores. */
function robustness() {
  const r = state.data.robustness;
  if (!r) return "";
  const tie = r.tie_break.last_cutoffs, p95 = r.threshold.p95, p90 = r.threshold.p90;
  return `
    <ul class="checks">
      <li>O desempate "mais recente primeiro" vence tanto nas 3 primeiras datas quanto nas 2 últimas. Nas últimas: <strong>${compact(tie.recent_first.won_revenue)}</strong> de receita, contra ${compact(tie.oldest_first.won_revenue)} do mais antigo primeiro e ${compact(r.price_only.last_cutoffs.won_revenue)} de ordenar só pelo valor.</li>
      <li>Com um prazo menor que o máximo, a receita da fila quase não muda (${compact(p90.won_revenue)} com o percentil 90), mas vendas que ainda iam fechar passariam para Confirmar ou encerrar: <strong>${fmt(p95.beyond_won)}</strong> com o percentil 95 e <strong>${fmt(p90.beyond_won)}</strong> com o 90. Com o prazo máximo, nenhuma.</li>
    </ul>
    <p>Ainda é um teste com dados passados e um dataset que parece sintético; o próximo passo é um piloto com parte do time.</p>`;
}

function glossary() {
  const terms = [
    ["Valor potencial", GLOSSARY.valorPotencial],
    ["Prazo máximo", GLOSSARY.prazoMaximo(state.data.reference.maxCycle)],
    ["Início · Em andamento · Perto do limite", "Fases da coluna Negociar, pelos dias em negociação. Indicam o que fazer; não mudam a ordem."],
    ["Prazo excedido", "Mais dias em negociação do que qualquer venda já levou para fechar."],
    ["Conta pendente", GLOSSARY.contaPendente],
    ["Prospecção · Negociação", "Etapas abertas do CRM (Prospecting e Engaging). A prospecção não tem data de início registrada."],
  ];
  return `<dl class="defs">${terms.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>`;
}

function limits() {
  return `
    <ul class="checks">
      <li>Dados do CRM até ${fmtDate(state.data.snapshot)}. Os dias em negociação são contados até essa data.</li>
      <li>A contagem começa no início da negociação; o CRM não registra o último contato com o cliente.</li>
      <li>Qualificar é ordenada só pelo valor: a prospecção não tem data nem outro sinal nos dados que indique quais oportunidades vão avançar.</li>
      <li>O sistema é somente leitura: não altera etapas nem envia mensagens. Ações marcadas ficam salvas apenas neste navegador.</li>
      <li>As regras precisam de acompanhamento com o time comercial e de recálculo periódico do prazo máximo.</li>
    </ul>`;
}

export function renderHelp() {
  const body = {
    visao: overview(), classificacao: flow(), prazos: ruler(), acoes: actions(), ordem: ordering(),
    dashboard: indicators(), funcionalidades: features(), evidencia: evidence(), glossario: glossary(), limites: limits(),
  };
  document.getElementById("help-content").innerHTML = `
    <header class="modal-head help-head">
      <div class="modal-head-main">
        <p class="kicker">Lead Kanban</p>
        <h2 id="help-title">Procedimento e regras do sistema</h2>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="Fechar">✕</button>
    </header>
    <div class="help-body">
      <nav class="help-toc" aria-label="Seções do procedimento">
        ${SECTIONS.map(([id, label], i) => `<a href="#help-${id}" data-toc="${id}"><span>${String(i + 1).padStart(2, "0")}</span>${label}</a>`).join("")}
      </nav>
      <div class="help-content" id="help-scroll">
        ${SECTIONS.map(([id, label], i) => `
          <section class="help-section" id="help-${id}">
            <h3><span>${String(i + 1).padStart(2, "0")}</span>${label}</h3>
            ${body[id]}
          </section>`).join("")}
      </div>
    </div>`;
}

export function bindHelp() {
  const modal = document.getElementById("help-modal");
  const open = () => { renderHelp(); modal.showModal(); };
  document.getElementById("open-help").addEventListener("click", () => state.data && open());
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && state.data && !modal.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) open();
  });
  modal.addEventListener("click", (e) => {
    const link = e.target.closest("[data-toc]");
    if (link) {
      e.preventDefault();
      document.getElementById(`help-${link.dataset.toc}`).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}
