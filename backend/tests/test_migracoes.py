import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def test_migracoes_batem_com_os_modelos(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    url = f"sqlite:///{tmp_path / 'migracoes.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config(str(ALEMBIC_INI))

    command.upgrade(config, "head")
    # Falha se algum modelo mudou sem migração correspondente.
    command.check(config)

    engine = create_engine(url)
    with engine.connect() as conexao:
        assert conexao.execute(text("SELECT valor FROM sync_contador WHERE id = 1")).scalar() == 0
    engine.dispose()

    command.downgrade(config, "base")


def test_migracao_que_recria_tabela_com_dados(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No SQLite, tirar uma coluna recria a tabela. Com registros apontando para ela (fichas do
    usuário), isso só funciona com as chaves estrangeiras desligadas durante a migração."""
    url = f"sqlite:///{tmp_path / 'com_dados.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config(str(ALEMBIC_INI))
    command.upgrade(config, "af11911612e9")  # antes de as metas saírem de `usuarios`

    engine = create_engine(url)
    usuario = "0d7d4f9c472a4926aa6a4ad9e3cfe362"
    with engine.begin() as conexao:
        conexao.execute(
            text(
                "INSERT INTO usuarios (id, google_sub, email, criado_em, meta_kcal) "
                "VALUES (:id, 'sub', 'ana@exemplo.com', '2026-11-01 10:00:00', 2200)"
            ),
            {"id": usuario},
        )
        conexao.execute(
            text(
                "INSERT INTO fichas (id, atualizado_em, excluido, nome, ordem, usuario_id, versao) "
                "VALUES ('f1', '2026-11-01 10:00:00', 0, 'Push', 1, :id, 1)"
            ),
            {"id": usuario},
        )
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_engine(url)
    with engine.connect() as conexao:
        assert conexao.execute(text("SELECT count(*) FROM usuarios")).scalar() == 1
        assert conexao.execute(text("SELECT usuario_id FROM fichas")).scalar() == usuario
        assert conexao.execute(text("PRAGMA foreign_key_check")).fetchall() == []
    engine.dispose()


def test_substitutos_entram_vazios_e_o_codigo_antigo_segue_inserindo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A migração dos substitutos roda antes do deploy, com o código antigo no ar: os exercícios
    que já existem ficam com [] e quem insere sem a coluna (o código antigo) também."""
    url = f"sqlite:///{tmp_path / 'substitutos.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config(str(ALEMBIC_INI))
    command.upgrade(config, "fe60c77a65eb")  # antes dos substitutos

    inserir = text(
        "INSERT INTO exercicios (id, atualizado_em, excluido, nome, grupo_muscular, imagens, "
        "instrucoes, versao) VALUES (:id, '2026-11-01 10:00:00', 0, 'Supino', 'Peito', '[]', "
        "'[]', 1)"
    )
    engine = create_engine(url)
    with engine.begin() as conexao:
        conexao.execute(inserir, {"id": "e1"})
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_engine(url)
    with engine.begin() as conexao:
        conexao.execute(inserir, {"id": "e2"})  # como o código antigo: sem a coluna nova
        valores = conexao.execute(text("SELECT substitutos FROM exercicios ORDER BY id")).all()
    engine.dispose()
    assert [json.loads(v) for (v,) in valores] == [[], []]

    command.downgrade(config, "fe60c77a65eb")
