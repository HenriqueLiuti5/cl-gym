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
