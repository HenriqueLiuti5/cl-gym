import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func
from sqlmodel import Session, col, select

from backend.convites import situacao
from backend.dados_dev import AMIGOS, FUSO, gerar, gerar_amigos, id_meta, id_registro_diario, main
from backend.models import (
    Convite,
    Ficha,
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


def fichas_de(session: Session, usuario_id: uuid.UUID | None) -> list[Ficha]:
    """As fichas da pessoa (ou as fichas modelo, com `None`)."""
    dono = col(Ficha.usuario_id)
    filtro = dono.is_(None) if usuario_id is None else dono == usuario_id
    return list(session.exec(select(Ficha).where(filtro)).all())


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
    # A conta nova começa sem fichas, mas a de dev recebe a cópia dos modelos para treinar.
    assert sorted(f.nome for f in fichas_de(session, usuario.id)) == sorted(
        f.nome for f in fichas_de(session, None)
    )

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
    # As fichas copiadas dos modelos não se repetem.
    assert len(fichas_de(session, usuario.id)) == len(fichas_de(session, None))
    session.refresh(lancado)
    assert lancado.kcal == 1234
    assert session.get(Usuario, usuario.id).nome == "Henrique"

    # Com menos semanas, o que sobrou da rodada anterior vira excluído (o app baixa a exclusão).
    resumo = gerar(session, EMAIL, semanas=3)
    assert resumo.excluidos > 0
    assert ativos(session, Sessao) == resumo.treinos


def test_amigos_de_exemplo_para_a_administracao(com_catalogo: Session) -> None:
    session = com_catalogo
    assert gerar_amigos(session) == (3, 2)
    # De novo: atualiza sem duplicar.
    assert gerar_amigos(session) == (3, 2)

    amigos = session.exec(select(Usuario)).all()
    assert sorted(u.email for u in amigos) == sorted(a.email for a in AMIGOS)
    assert all(u.google_sub == f"dev:{u.email}" for u in amigos)  # dá para entrar como dev
    assert sum(u.bloqueado_em is not None for u in amigos) == 1
    assert {u.aparelho for u in amigos} == {"iPhone", "Android", "Computador"}
    assert ativos(session, Sessao) == sum(len(a.treinos) for a in AMIGOS)
    for sessao in session.exec(select(Sessao)).all():
        SessaoBase.model_validate(sessao.model_dump())
        assert sessao.ficha_id is not None  # os amigos treinam com a cópia dos modelos
    modelos = len(fichas_de(session, None))
    assert all(len(fichas_de(session, u.id)) == modelos for u in amigos)

    convites = session.exec(select(Convite)).all()
    assert sorted(situacao(c) for c in convites) == ["usado", "valido"]
    usado = next(c for c in convites if c.usado_por is not None)
    assert session.get(Usuario, usado.usado_por).email == "marina@exemplo.com"


def test_so_roda_em_sqlite(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://usuario:senha@exemplo.neon.tech/banco")
    assert main(["--email", EMAIL]) == 1
    assert "SQLite" in capsys.readouterr().err
