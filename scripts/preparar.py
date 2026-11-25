"""Prepara o projeto num computador novo, com um comando só (Linux, macOS ou Windows):

    uv run scripts/preparar.py

O `uv run` já instala o Python 3.12 e as dependências do backend antes de chegar aqui. O script:

1. Cria o `.env` a partir do `.env.example`, se ainda não existir, com uma `SESSAO_SECRET` nova e
   o `LOGIN_DEV=1` ligado (para entrar sem Google no computador). Um `.env` que já existe nunca é
   alterado.
2. Cria ou atualiza o banco local (`alembic upgrade head`) e carrega o catálogo (seed). Só mexe
   em banco SQLite: com um `DATABASE_URL` de Postgres (o Neon) estes passos são pulados.
3. Instala as dependências do frontend (`npm ci`), conferindo a versão do Node do `.nvmrc`.

Pode rodar de novo quando quiser (depois de um `git pull`, por exemplo): nada é apagado.
"""

import os
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))  # para importar `backend` rodando como script


def gerar_env(exemplo: str) -> str:
    """Transforma o texto do `.env.example` no `.env` de desenvolvimento."""
    segredo = secrets.token_urlsafe(48)
    texto, n_segredo = re.subn(
        r"(?m)^SESSAO_SECRET=.*$", lambda _: f"SESSAO_SECRET={segredo}", exemplo
    )
    texto, n_dev = re.subn(r"(?m)^#\s*LOGIN_DEV=.*$", "LOGIN_DEV=1", texto)
    if n_segredo != 1 or n_dev != 1:
        raise ValueError("o .env.example mudou: ajuste gerar_env em scripts/preparar.py")
    return texto


def email_dev(env: str) -> str | None:
    """O e-mail do admin, que serve para o "Entrar como dev" (cria a conta sem convite)."""
    achado = re.search(r"(?m)^ADMIN_EMAIL=(\S+)", env)
    return achado.group(1) if achado else None


def passo(titulo: str) -> None:
    print(f"\n==> {titulo}", flush=True)


def rodar(*comando: str, pasta: Path = RAIZ) -> None:
    subprocess.run(comando, cwd=pasta, check=True)


def criar_env() -> None:
    env = RAIZ / ".env"
    if env.exists():
        print(".env já existe; ficou como estava.")
        return
    env.write_text(gerar_env((RAIZ / ".env.example").read_text(encoding="utf-8")), "utf-8")
    print("Criei o .env com uma SESSAO_SECRET nova e LOGIN_DEV=1.")


def preparar_banco() -> None:
    from backend.config import DatabaseSettings

    if not DatabaseSettings().database_url.startswith("sqlite"):
        print("O DATABASE_URL não é SQLite; pulei as migrações e o seed para não mexer na nuvem.")
        print("Para aplicar no Neon de propósito, veja o passo 4 de 'Deploy' no CLAUDE.md.")
        return
    rodar(sys.executable, "-m", "alembic", "upgrade", "head")
    rodar(sys.executable, "-m", "backend.seed")


def preparar_frontend() -> bool:
    node, npm = shutil.which("node"), shutil.which("npm")
    esperado = (RAIZ / ".nvmrc").read_text(encoding="utf-8").strip()
    if not node or not npm:
        print(f"Não achei o Node. Instale o Node {esperado} e rode este script de novo.")
        return False
    versao = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    achado = re.match(r"v(\d+)", versao)
    if not achado or achado.group(1) != esperado.split(".")[0]:
        print(f"Aviso: o projeto usa o Node {esperado} (.nvmrc) e este computador tem {versao}.")
    rodar(npm, "ci", pasta=RAIZ / "frontend")
    return True


def main() -> int:
    os.chdir(RAIZ)  # o .env e o banco SQLite (./clgym.db) são relativos à raiz
    try:
        passo("Configuração (.env)")
        criar_env()
        passo("Banco local (migrações e catálogo)")
        preparar_banco()
        passo("Frontend (npm ci)")
        frontend_ok = preparar_frontend()
    except subprocess.CalledProcessError as erro:
        print(f"\nFalhou: {' '.join(map(str, erro.cmd))}", file=sys.stderr)
        return 1

    email = email_dev((RAIZ / ".env").read_text(encoding="utf-8"))
    passo("Pronto" if frontend_ok else "Backend pronto; falta o frontend")
    print("Rode em dois terminais:")
    print("  uv run uvicorn backend.main:app --reload")
    print("  npm --prefix frontend run dev")
    print("e abra http://localhost:5173", end="")
    print(f' ("Entrar como dev" com {email}).' if email else ".")
    return 0 if frontend_ok else 1


if __name__ == "__main__":
    sys.exit(main())
