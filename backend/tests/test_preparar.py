"""O `.env` que `scripts/preparar.py` cria num computador novo tem que funcionar de primeira."""

from pathlib import Path

import pytest

from backend.config import Settings
from scripts.preparar import email_dev, gerar_env

EXEMPLO = (Path(__file__).resolve().parents[2] / ".env.example").read_text(encoding="utf-8")


@pytest.fixture(autouse=True)
def _sem_variaveis_do_ambiente(monkeypatch: pytest.MonkeyPatch) -> None:
    # Variáveis do terminal têm prioridade sobre o arquivo; o teste lê só o .env gerado.
    for chave in Settings.model_fields:
        monkeypatch.delenv(chave.upper(), raising=False)
    monkeypatch.delenv("VERCEL", raising=False)


def test_env_gerado_carrega_e_liga_o_login_dev(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text(gerar_env(EXEMPLO), encoding="utf-8")

    settings = Settings(_env_file=env)  # type: ignore[call-arg]

    assert settings.login_dev_ativo
    assert settings.database_url.startswith("sqlite")
    assert "troque" not in settings.sessao_secret
    assert settings.email_permitido(email_dev(EXEMPLO) or "")


def test_cada_env_gerado_tem_segredo_proprio() -> None:
    assert gerar_env(EXEMPLO) != gerar_env(EXEMPLO)


def test_avisa_se_o_exemplo_mudar() -> None:
    with pytest.raises(ValueError, match="mudou"):
        gerar_env("DATABASE_URL=sqlite:///./clgym.db\n")
