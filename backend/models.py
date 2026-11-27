"""Modelos do banco e esquemas de sincronização.

Para cada entidade sincronizável há:
- `XBase`: campos que o app envia/recebe (validados pelo Pydantic);
- `X` (table=True): a tabela, com `versao` e `usuario_id`, ambos controlados pelo servidor;
- `XOut`: o que o servidor devolve no download (`XBase` + `versao`).

O `id` (UUID) é gerado pelo app, `atualizado_em` decide conflitos (a escrita mais recente vence)
e `excluido` faz exclusão lógica para propagar remoções.

O `usuario_id` nunca vem do app: o servidor o define a partir do token de sessão. Exercícios e
fichas com `usuario_id` nulo são do catálogo (carregado pelo seed): os exercícios são baixados
por todos, e as fichas são os modelos prontos. A conta nova começa sem fichas; o app oferece os
modelos em "Usar um modelo pronto" (`GET /api/modelos`) e envia a cópia escolhida, com ids novos,
pela sincronização normal.
"""

import datetime as dt
import uuid
from typing import Literal, Self

from pydantic import AwareDatetime, model_validator
from sqlalchemy import JSON, Index, UniqueConstraint, false, text
from sqlmodel import Field, SQLModel

from backend.db import ListaUUID, UTCDateTime

# --- Usuários -------------------------------------------------------------------------------


class Perfil(SQLModel):
    """O que a própria pessoa altera na conta (`PATCH /api/conta`): nome, altura e idade.

    O peso atual não fica aqui (é o último `peso_kg` lançado no registro do dia), nem as metas:
    elas são registros sincronizáveis (`Meta`), para poderem mudar offline.
    """

    # Vem do Google no primeiro login; depois é a pessoa quem escolhe.
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    altura_cm: int | None = Field(default=None, ge=50, le=250)
    idade: int | None = Field(default=None, ge=10, le=120)


class Usuario(Perfil, table=True):
    __tablename__ = "usuarios"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Identificador fixo da conta Google (o e-mail pode mudar).
    google_sub: str = Field(max_length=255, unique=True, index=True)
    email: str = Field(max_length=320)
    criado_em: AwareDatetime = Field(sa_type=UTCDateTime)

    # Atividade, só para a área de administração (gravada a cada chamada com o token).
    visto_em: AwareDatetime | None = Field(default=None, sa_type=UTCDateTime)
    # "iPhone", "iPad", "Android" ou "Computador", pelo User-Agent da última chamada.
    aparelho: str | None = Field(default=None, max_length=20)
    # A última chamada veio do app instalado (e não do navegador).
    instalado: bool = Field(default=False, sa_column_kwargs={"server_default": false()})
    # Bloqueado pelo admin: perde o acesso, mas os dados ficam.
    bloqueado_em: AwareDatetime | None = Field(default=None, sa_type=UTCDateTime)


class UsuarioOut(Perfil):
    id: uuid.UUID
    email: str
    criado_em: AwareDatetime
    # A conta do ADMIN_EMAIL: o app mostra a área de administração.
    admin: bool = False


class UsuarioResumo(SQLModel):
    id: uuid.UUID
    nome: str | None
    email: str


class UsuarioAdmin(UsuarioResumo):
    """O que o admin vê de cada pessoa: só atividade. Nada de peso, alimentação, metas ou cargas."""

    criado_em: AwareDatetime
    visto_em: AwareDatetime | None
    aparelho: str | None
    instalado: bool
    bloqueado: bool
    bloqueado_em: AwareDatetime | None
    admin: bool
    # Treinos terminados (sem os excluídos): no total e nos últimos 30 dias.
    treinos: int
    treinos_30d: int
    ultimo_treino: AwareDatetime | None


# --- Convites -------------------------------------------------------------------------------

SituacaoConvite = Literal["valido", "expirado", "usado", "cancelado"]


class Convite(SQLModel, table=True):
    """Convite para criar conta: código de 8 caracteres, vale 24 h e serve para uma pessoa.
    Não sincroniza: só o admin vê, pela API."""

    __tablename__ = "convites"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Sem hífen (o app mostra "XXXX-XXXX"). Alfabeto em backend/convites.py.
    codigo: str = Field(max_length=8, unique=True, index=True)
    criado_em: AwareDatetime = Field(sa_type=UTCDateTime)
    expira_em: AwareDatetime = Field(sa_type=UTCDateTime)
    usado_em: AwareDatetime | None = Field(default=None, sa_type=UTCDateTime)
    # Quem criou a conta com ele (fica nulo se a conta for apagada).
    usado_por: uuid.UUID | None = Field(default=None, foreign_key="usuarios.id")
    cancelado_em: AwareDatetime | None = Field(default=None, sa_type=UTCDateTime)


class ConvitePublico(SQLModel):
    """O que quem recebeu o link pode saber do convite (nunca o código)."""

    situacao: SituacaoConvite
    expira_em: AwareDatetime


class ConviteAdmin(SQLModel):
    id: uuid.UUID
    # "XXXX-XXXX" enquanto vale; depois de usado, expirado ou cancelado, some (nulo).
    codigo: str | None
    situacao: SituacaoConvite
    criado_em: AwareDatetime
    expira_em: AwareDatetime
    usado_em: AwareDatetime | None
    cancelado_em: AwareDatetime | None
    usado_por: UsuarioResumo | None


# --- Base da sincronização ------------------------------------------------------------------


class Sincronizavel(SQLModel):
    id: uuid.UUID = Field(primary_key=True)
    atualizado_em: AwareDatetime = Field(sa_type=UTCDateTime)
    excluido: bool = False


class ComVersao(SQLModel):
    # Valor do contador global no momento em que o servidor gravou o registro (cursor do download).
    versao: int = Field(default=0, index=True)


class DoCatalogoOuUsuario(SQLModel):
    # Nulo = catálogo compartilhado (seed).
    usuario_id: uuid.UUID | None = Field(default=None, foreign_key="usuarios.id", index=True)


class DoUsuario(SQLModel):
    usuario_id: uuid.UUID = Field(foreign_key="usuarios.id", index=True)


# --- Exercícios -----------------------------------------------------------------------------

MAX_SUBSTITUTOS = 5


class ExercicioBase(Sincronizavel):
    nome: str = Field(min_length=1, max_length=120)
    grupo_muscular: str = Field(min_length=1, max_length=60)
    # URLs das imagens de demonstração (ex.: posição inicial e final, exibidas em sequência).
    imagens: list[str] = Field(default_factory=list, sa_type=JSON)
    instrucoes: list[str] = Field(default_factory=list, sa_type=JSON)
    # Link de GIF/vídeo de demonstração.
    midia_url: str | None = Field(default=None, max_length=500)
    # Exercícios parecidos, do mais parecido ao menos (até 5). O app sugere os 2 primeiros como
    # Plano B ao montar um treino e mostra todos na troca durante o treino. O `server_default`
    # fica no banco: o código anterior a este campo insere exercícios sem a coluna.
    substitutos: list[uuid.UUID] = Field(
        default_factory=list, sa_type=ListaUUID, sa_column_kwargs={"server_default": "[]"}
    )

    @model_validator(mode="after")
    def _validar_substitutos(self) -> Self:
        if len(self.substitutos) > MAX_SUBSTITUTOS:
            raise ValueError(f"no máximo {MAX_SUBSTITUTOS} substitutos")
        if len(set(self.substitutos)) != len(self.substitutos):
            raise ValueError("substituto repetido")
        if self.id in self.substitutos:
            raise ValueError("o exercício não pode ser substituto de si mesmo")
        return self


class Exercicio(ComVersao, DoCatalogoOuUsuario, ExercicioBase, table=True):
    __tablename__ = "exercicios"


class ExercicioOut(ComVersao, DoCatalogoOuUsuario, ExercicioBase):
    """Traz o `usuario_id` para o app saber o que é do catálogo (só leitura)."""


# --- Fichas (treinos: Push, Pull, Leg day, Upper...) ----------------------------------------


class FichaBase(Sincronizavel):
    nome: str = Field(min_length=1, max_length=60)
    # Ordem de exibição.
    ordem: int = Field(default=0, ge=0)


class Ficha(ComVersao, DoCatalogoOuUsuario, FichaBase, table=True):
    """Com `usuario_id` nulo é uma ficha modelo: não vem na sincronização. O app a mostra em
    "Usar um modelo pronto" (`GET /api/modelos`) e envia a cópia como uma ficha da pessoa."""

    __tablename__ = "fichas"


class FichaOut(ComVersao, FichaBase):
    pass


MAX_ALTERNATIVAS = 2


class FichaExercicioBase(Sincronizavel):
    ficha_id: uuid.UUID = Field(foreign_key="fichas.id", index=True)
    exercicio_id: uuid.UUID = Field(foreign_key="exercicios.id")
    ordem: int = Field(default=0, ge=0)
    series: int = Field(ge=1, le=20)
    # Um número só, nunca faixa: todas as séries com o mesmo peso, parando a 1–2 reps da falha.
    alvo_reps: int = Field(ge=1, le=100)
    # Faz 1×10 leve (~50% do peso) antes; não conta como série.
    aquecimento: bool = False
    # Bi-set (itens com o mesmo número feitos em sequência): o app não usa mais desde 26/11/2026.
    # Fica no banco e na sincronização porque versões antigas do app ainda mandam o campo e as
    # fichas que já existem guardam o valor.
    grupo_biset: int | None = Field(default=None, ge=1, le=100)
    # Plano B: até 2 exercícios, em ordem de preferência, para quando o aparelho estiver ocupado.
    alternativas: list[uuid.UUID] = Field(default_factory=list, sa_type=ListaUUID)
    # Dicas de execução.
    observacao: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _validar_alternativas(self) -> Self:
        if len(self.alternativas) > MAX_ALTERNATIVAS:
            raise ValueError(f"no máximo {MAX_ALTERNATIVAS} alternativas")
        if len(set(self.alternativas)) != len(self.alternativas):
            raise ValueError("alternativa repetida")
        if self.exercicio_id in self.alternativas:
            raise ValueError("o exercício não pode ser alternativa de si mesmo")
        return self


class FichaExercicio(ComVersao, DoCatalogoOuUsuario, FichaExercicioBase, table=True):
    __tablename__ = "ficha_exercicios"


class FichaExercicioOut(ComVersao, FichaExercicioBase):
    pass


# --- Fichas modelo (GET /api/modelos) -------------------------------------------------------


class ItemModeloOut(SQLModel):
    """Um exercício da ficha modelo, só com o que o app copia (sem bi-set)."""

    exercicio_id: uuid.UUID
    ordem: int
    series: int
    alvo_reps: int
    aquecimento: bool
    alternativas: list[uuid.UUID]
    observacao: str | None


class FichaModeloOut(SQLModel):
    """Ficha modelo do catálogo. O app copia localmente, com ids novos, e envia a cópia pela
    sincronização normal (por isso não existe rota de cópia)."""

    id: uuid.UUID
    nome: str
    ordem: int
    exercicios: list[ItemModeloOut]


# --- Treinos realizados ---------------------------------------------------------------------


class SessaoBase(Sincronizavel):
    # Ficha seguida no treino (nula para treino avulso).
    ficha_id: uuid.UUID | None = Field(default=None, foreign_key="fichas.id", index=True)
    iniciada_em: AwareDatetime = Field(sa_type=UTCDateTime)
    finalizada_em: AwareDatetime | None = Field(default=None, sa_type=UTCDateTime)
    observacao: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _fim_depois_do_inicio(self) -> Self:
        if self.finalizada_em is not None and self.finalizada_em < self.iniciada_em:
            raise ValueError("finalizada_em não pode ser anterior a iniciada_em")
        return self


class Sessao(ComVersao, DoUsuario, SessaoBase, table=True):
    __tablename__ = "sessoes"


class SessaoOut(ComVersao, SessaoBase):
    pass


class SerieBase(Sincronizavel):
    sessao_id: uuid.UUID = Field(foreign_key="sessoes.id", index=True)
    # Exercício realmente executado (pode ser uma alternativa do planejado).
    exercicio_id: uuid.UUID = Field(foreign_key="exercicios.id", index=True)
    # Item da ficha que esta série cumpre (nulo se o exercício foi feito fora da ficha).
    ficha_exercicio_id: uuid.UUID | None = Field(default=None, foreign_key="ficha_exercicios.id")
    numero: int = Field(ge=1, le=50)
    carga_kg: float = Field(ge=0, le=1000)
    repeticoes: int = Field(ge=0, le=1000)


class Serie(ComVersao, DoUsuario, SerieBase, table=True):
    __tablename__ = "series"


class SerieOut(ComVersao, SerieBase):
    pass


# --- Peso e alimentação ---------------------------------------------------------------------


class RegistroDiarioBase(Sincronizavel):
    """Um por dia. Como só pode haver um por data, o app deve gerar o `id` de forma
    determinística a partir do usuário e da data (ex.: UUID v5), igual em todos os aparelhos."""

    data: dt.date
    peso_kg: float | None = Field(default=None, gt=0, le=500)  # em jejum
    kcal: int | None = Field(default=None, ge=0, le=20000)
    proteina_g: float | None = Field(default=None, ge=0, le=1000)
    carbo_g: float | None = Field(default=None, ge=0, le=2000)
    agua_ml: int | None = Field(default=None, ge=0, le=20000)
    observacao: str | None = Field(default=None, max_length=500)


class RegistroDiario(ComVersao, DoUsuario, RegistroDiarioBase, table=True):
    __tablename__ = "registros_diarios"
    __table_args__ = (UniqueConstraint("usuario_id", "data"),)


class RegistroDiarioOut(ComVersao, RegistroDiarioBase):
    pass


# --- Metas ----------------------------------------------------------------------------------

# Tipo → (mínimo, máximo) do valor. Peso e carga são "destinos": a pessoa quer chegar lá uma vez
# (e o app comemora). As outras valem para cada dia (ou semana, em `treinos_semana`).
LIMITES_META: dict[str, tuple[float, float]] = {
    "peso": (20, 500),  # kg, pela média de 7 dias
    "carga": (0.5, 1000),  # kg, de um exercício (`exercicio_id`)
    "kcal": (100, 20000),  # por dia
    "proteina": (1, 1000),  # g por dia
    "carbo": (1, 2000),  # g por dia
    "agua": (100, 20000),  # ml por dia
    "treinos_semana": (1, 14),
}


class MetaBase(Sincronizavel):
    """Onde a pessoa quer chegar. Só existe uma por tipo (e, nas de carga, uma por exercício),
    então o app gera o `id` de forma determinística a partir do usuário, do tipo e do exercício
    (UUID v5), igual em todos os aparelhos."""

    tipo: str = Field(max_length=20)
    exercicio_id: uuid.UUID | None = Field(default=None, foreign_key="exercicios.id", index=True)
    valor: float
    # De onde a pessoa partiu quando definiu a meta (peso ou recorde do exercício): dá o sentido
    # (subir ou descer) e quanto do caminho já foi feito.
    inicio: float | None = Field(default=None, ge=0, le=20000)

    @model_validator(mode="after")
    def _validar_meta(self) -> Self:
        limites = LIMITES_META.get(self.tipo)
        if limites is None:
            raise ValueError(f"tipo de meta desconhecido: {self.tipo}")
        minimo, maximo = limites
        if not minimo <= self.valor <= maximo:
            raise ValueError(f"a meta de {self.tipo} vai de {minimo:g} a {maximo:g}")
        if (self.tipo == "carga") != (self.exercicio_id is not None):
            raise ValueError("só a meta de carga tem exercício, e ela precisa de um")
        if self.tipo == "treinos_semana" and not self.valor.is_integer():
            raise ValueError("a meta de treinos por semana é um número inteiro")
        return self


class Meta(ComVersao, DoUsuario, MetaBase, table=True):
    __tablename__ = "metas"
    # Uma por tipo e, nas de carga, uma por exercício. São índices parciais porque numa UNIQUE
    # comum dois `exercicio_id` nulos não contam como iguais.
    __table_args__ = (
        Index(
            "uq_metas_tipo",
            "usuario_id",
            "tipo",
            unique=True,
            sqlite_where=text("exercicio_id IS NULL"),
            postgresql_where=text("exercicio_id IS NULL"),
        ),
        Index(
            "uq_metas_exercicio",
            "usuario_id",
            "tipo",
            "exercicio_id",
            unique=True,
            sqlite_where=text("exercicio_id IS NOT NULL"),
            postgresql_where=text("exercicio_id IS NOT NULL"),
        ),
    )


class MetaOut(ComVersao, MetaBase):
    pass


# --- Controle da sincronização --------------------------------------------------------------


class SyncContador(SQLModel, table=True):
    """Linha única com o contador global; cada gravação recebe o próximo valor como `versao`."""

    __tablename__ = "sync_contador"

    id: int = Field(default=1, primary_key=True)
    valor: int = 0
