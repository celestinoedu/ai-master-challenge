"""Versão Streamlit (alternativa) do Lead Kanban.

A interface principal é o quadro Kanban servido por ``server.py``. Esta versão
usa a mesma regra de ``leadscore.priority`` em formato de lista e tabela.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from leadscore.data import ARCHIVE_NAME, DataQualityError, download_archive, load_dataset
from leadscore.priority import (LANES, PriorityItem, build_queue, build_reference,
                                filter_queue)


LANE_TITLES = {"negociar": "Negociar", "qualificar": "Qualificar", "encerrar": "Confirmar ou encerrar"}

st.set_page_config(page_title="Lead Kanban", page_icon="📍",
                   layout="wide", initial_sidebar_state="expanded")

st.markdown("""
<style>
  .block-container { max-width: 1320px; padding-top: 1.8rem; padding-bottom: 3rem; }
  [data-testid="stSidebar"] { background: #031a26; }
  [data-testid="stSidebar"] * { color: #f5f4f3; }
  h1, h2, h3 { color: #001f35; letter-spacing: -.02em; }
  div[data-testid="stMetric"] { background: #ffffff; border: 1px solid #e4e0da;
                                border-radius: 12px; padding: .85rem 1rem; }
</style>
""", unsafe_allow_html=True)


@st.cache_data(show_spinner="Lendo as quatro tabelas públicas do CRM...")
def load_portfolio():
    archive = download_archive(Path(__file__).resolve().parent / "data" / ARCHIVE_NAME)
    dataset = load_dataset(archive)
    reference = build_reference(dataset)
    return dataset, reference, build_queue(dataset, reference=reference)


def fmt(value) -> str:
    return f"{value:,.0f}".replace(",", ".")


def cycle_text(item: PriorityItem, max_cycle: int) -> str:
    if item.days_in_engaging is None:
        return "sem data de entrada"
    if item.days_beyond_cycle:
        return f"{item.days_in_engaging} dias · prazo excedido em {item.days_beyond_cycle}"
    return f"{item.days_in_engaging} de {max_cycle} dias"


def draw_card(item: PriorityItem, max_cycle: int, *, key: str) -> None:
    deal = item.opportunity
    with st.container(border=True):
        title, value = st.columns([4, 1])
        title.markdown(f"**{deal.product}** · {deal.account or 'Conta pendente'}")
        title.caption(f"{deal.opportunity_id} · {item.phase} · {cycle_text(item, max_cycle)} · {deal.sales_agent}")
        value.markdown(f"**{fmt(item.catalog_price)}**")
        st.write(item.next_action)
        if st.button("Ver detalhes", key=key):
            st.session_state["deal_picker"] = deal.opportunity_id


def draw_detail(item: PriorityItem, max_cycle: int) -> None:
    deal = item.opportunity
    with st.container(border=True):
        st.subheader(f"{deal.product} · {deal.opportunity_id}")
        st.caption(f"{LANE_TITLES[item.lane]} · {item.phase} · {cycle_text(item, max_cycle)}")
        st.info(item.next_action)
        left, right = st.columns(2)
        with left:
            st.markdown("**Ações**")
            for action in item.actions:
                st.write(f"- {action}")
            st.markdown("**Contexto**")
            st.write(f"Conta: {deal.account or 'não identificada'} · Etapa: {deal.deal_stage}")
            st.write(f"Valor potencial (preço de catálogo): {fmt(item.catalog_price)}")
            if deal.engage_date:
                st.write(f"Entrada em Engaging: {deal.engage_date:%d/%m/%Y}")
        with right:
            st.markdown(f"**Por que está em “{LANE_TITLES[item.lane]}”**")
            for reason in item.reasons:
                st.write(f"**{reason.label} ({reason.value}):** {reason.detail}")
        st.caption(f"Responsável: {deal.sales_agent} · Manager: {item.manager} · Regional: {item.regional_office}")


st.title("Lead Kanban")
st.caption("Versão alternativa em Streamlit. A interface principal é o quadro Kanban (`python server.py`).")

try:
    dataset, reference, queue = load_portfolio()
except (DataQualityError, OSError, ValueError) as exc:
    st.error(f"Não foi possível preparar o dataset: {exc}")
    st.stop()

with st.sidebar:
    st.markdown("## Escolher carteira")
    agents = tuple(dataset.sales_agents.values())
    region_choice = st.selectbox("Regional", ["Todas", *sorted({a.regional_office for a in agents})])
    region = None if region_choice == "Todas" else region_choice
    managers = sorted({a.manager for a in agents if region is None or a.regional_office == region})
    manager_choice = st.selectbox("Manager", ["Todos", *managers])
    manager = None if manager_choice == "Todos" else manager_choice
    names = sorted(a.name for a in agents if (region is None or a.regional_office == region)
                   and (manager is None or a.manager == manager))
    agent_choice = st.selectbox("Vendedor", ["Todos", *names])
    agent = None if agent_choice == "Todos" else agent_choice
    lanes = frozenset(st.multiselect("Frentes", list(LANES), default=list(LANES),
                                     format_func=LANE_TITLES.get))
    only_missing = st.checkbox("Só contas pendentes")
    search = st.text_input("Buscar", placeholder="ID, produto, conta ou vendedor")

visible = filter_queue(queue, regional_office=region, manager=manager, sales_agent=agent,
                       lanes=lanes, account_missing=True if only_missing else None, search=search)
by_lane = {lane: [item for item in visible if item.lane == lane] for lane in LANES}

m1, m2, m3, m4 = st.columns(4)
m1.metric("Negociar", len(by_lane["negociar"]))
m2.metric("Qualificar", len(by_lane["qualificar"]))
m3.metric("Confirmar ou encerrar", len(by_lane["encerrar"]))
m4.metric("Contas pendentes", sum(item.account_missing for item in visible))

if not visible:
    st.warning("Nenhuma oportunidade corresponde aos filtros.")
    st.stop()

ids = {item.opportunity.opportunity_id for item in visible}
if st.session_state.get("deal_picker") not in ids:
    st.session_state["deal_picker"] = visible[0].opportunity.opportunity_id

st.divider()
for column, lane in zip(st.columns(3, gap="large"), LANES):
    with column:
        st.subheader(LANE_TITLES[lane])
        for item in by_lane[lane][:3]:
            draw_card(item, reference.max_cycle_days, key=f"{lane}-{item.opportunity.opportunity_id}")
        if not by_lane[lane]:
            st.info("Nada nesta frente com os filtros atuais.")

st.divider()
st.subheader("Carteira completa")
frame = pd.DataFrame([{
    "Frente": LANE_TITLES[item.lane],
    "Fase": item.phase,
    "Oportunidade": item.opportunity.opportunity_id,
    "Produto": item.opportunity.product,
    "Valor potencial": float(item.catalog_price),
    "Dias em Engaging": item.days_in_engaging,
    "Conta": item.opportunity.account or "Conta pendente",
    "Vendedor": item.opportunity.sales_agent,
} for item in visible])
st.dataframe(frame, width="stretch", hide_index=True, height=420)
st.download_button("Baixar esta visão em CSV", frame.to_csv(index=False).encode("utf-8-sig"),
                   file_name="lead-kanban.csv", mime="text/csv")

by_id = {item.opportunity.opportunity_id: item for item in visible}
selected = st.selectbox("Abrir detalhes", list(by_id), key="deal_picker",
                        format_func=lambda i: f"{i} · {by_id[i].opportunity.product}")
draw_detail(by_id[selected], reference.max_cycle_days)

with st.expander("Como a fila funciona"):
    st.markdown(
        f"**Negociar:** Engaging dentro do prazo máximo de {reference.max_cycle_days} dias, o fechamento "
        f"mais longo entre {fmt(reference.closed)} negócios concluídos; ordem por valor potencial (preço "
        "de catálogo) e, no empate, o mais recente. **Qualificar:** Prospecting, sem data. **Confirmar ou "
        "encerrar:** Engaging com prazo excedido; no backtest, nenhum desses casos fechou depois. Os valores "
        "são preços de catálogo, não probabilidades. Detalhes em `docs/09-g3-revisao-fila-foco.md`."
    )
