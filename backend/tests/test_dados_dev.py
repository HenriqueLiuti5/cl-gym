import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func
from sqlmodel import Session, col, select

from backend.dados_dev import FUSO, gerar, id_meta, id_registro_diario, main
from backend.models import (
    Meta,
    MetaBase,
    RegistroDiario,
    RegistroDiarioBase,
    Serie,
    SerieBase,
    Sessao,
    SessaoBase,
    Usuario,
)
from backend.seed import ARQUIVO_PADRAO, carregar_catalogo, ler_catalogo

EMAIL = "dev@exemplo.com"
USUARIO = uuid.UUID("0d7d4f9c-472a-4926-aa6a-4ad9e3cfe362")


@pytest.fixture
def com_catalogo(session: Session) -> Session:
    carregar_catalogo(session, ler_catalogo(ARQUIVO_PADRAO))
    return session


def ativos(session: Session, modelo: type[Sessao] | type[Serie]) -> int:
    stmt = select(func.count()).select_from(modelo).where(col(modelo.excluido).is_(False))
    return session.exec(stmt).one()


def test_ids_batem_com_os_do_app() -> None:
    # Os mesmos valores estão em frontend/src/lib/ids.test.ts.
    assert str(id_meta(USUARIO, "peso")) == "63e95567-4fcc-5bf3-b613-806376b5fca2"
    dia = datetime(2026, 11, 24).date()
    assert id_registro_diario(USUARIO, dia) == uuid.uuid5(
        uuid.UUID("3c5b8f0e-2a4d-4f6b-9e1a-7d2c6b9a0f13"), f"{USUARIO}:2026-11-24"
    )


def test_gera_meses_de_dados_validos(com_catalogo: Session) -> None:
    session = com_catalogo
    resumo = gerar(session, EMAIL, semanas=8)
    assert resumo.treinos >= 15
    assert resumo.series > 10 * resumo.treinos
    assert resumo.registros > 40
    assert resumo.metas >= 8  # 6 gerais + carga (uma alcançada e duas pela frente)

    usuario = session.exec(select(Usuario).where(Usuario.email == EMAIL)).one()
    assert usuario.google_sub == f"dev:{EMAIL}"  # a mesma conta do "Entrar como dev"
    assert (usuario.nome, usuario.altura_cm, usuario.idade) == ("Dev", 178, 28)

    # Tudo passaria pela validação do envio do app (limites, datas com fuso, metas).
    for modelo, base in (
        (Sessao, SessaoBase),
        (Serie, SerieBase),
        (RegistroDiario, RegistroDiarioBase),
        (Meta, MetaBase),
    ):
        for registro in session.exec(select(modelo)).all():
            base.model_validate(registro.model_dump())

    hoje = datetime.now(FUSO).date()
    sessoes = session.exec(select(Sessao)).all()
    assert all(s.iniciada_em.astimezone(FUSO).date() < hoje for s in sessoes)
    metas = session.exec(select(Meta)).all()
    assert {m.tipo for m in metas} == {
        "peso",
        "kcal",
        "proteina",
        "carbo",
        "agua",
        "treinos_semana",
        "carga",
    }
    assert all(m.id == id_meta(usuario.id, m.tipo, m.exercicio_id) for m in metas)


def test_rodar_de_novo_nao_duplica_nem_apaga_o_que_foi_lancado(com_catalogo: Session) -> None:
    session = com_catalogo
    gerar(session, EMAIL, semanas=6)
    usuario = session.exec(select(Usuario).where(Usuario.email == EMAIL)).one()
    ontem = datetime.now(FUSO).date() - timedelta(days=1)
    lancado = session.exec(
        select(RegistroDiario).where(
            RegistroDiario.usuario_id == usuario.id, RegistroDiario.data == ontem
        )
    ).first()
    if lancado is None:
        lancado = RegistroDiario(
            id=id_registro_diario(usuario.id, ontem),
            usuario_id=usuario.id,
            atualizado_em=datetime.now(UTC),
            data=ontem,
            versao=1,
        )
        session.add(lancado)
    lancado.kcal = 1234  # "lançado à mão"
    usuario.nome = "Henrique"
    session.commit()
    treinos, series = ativos(session, Sessao), ativos(session, Serie)

    gerar(session, EMAIL, semanas=6)
    assert (ativos(session, Sessao), ativos(session, Serie)) == (treinos, series)
    session.refresh(lancado)
    assert lancado.kcal == 1234
    assert session.get(Usuario, usuario.id).nome == "Henrique"

    # Com menos semanas, o que sobrou da rodada anterior vira excluído (o app baixa a exclusão).
    resumo = gerar(session, EMAIL, semanas=3)
    assert resumo.excluidos > 0
    assert ativos(session, Sessao) == resumo.treinos


def test_so_roda_em_sqlite(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://usuario:senha@exemplo.neon.tech/banco")
    assert main(["--email", EMAIL]) == 1
    assert "SQLite" in capsys.readouterr().err
