# Local (não vai para o Git)

<!--
Modelo do CLAUDE.local.md, que o Git ignora e por isso não vem no clone. Num computador novo:
1. Clone o vault (repositório privado do Henrique no GitHub) em qualquer pasta.
2. Copie este arquivo para CLAUDE.local.md e troque <CAMINHO_DO_VAULT> pelo caminho dele.
3. Para o Claude Code ler o vault sem pedir permissão, crie .claude/settings.local.json com:
   { "permissions": { "additionalDirectories": ["<CAMINHO_DO_VAULT>"] } }
Nada de pessoal neste modelo: ele é público.
-->

- O vault do Obsidian com o treino e os objetivos do Henrique fica em `<CAMINHO_DO_VAULT>`
  (repositório privado do Henrique). Ele tem o próprio `CLAUDE.md`; leia antes de usar algo dele.
- Use o vault como referência para as regras de treino e para o modelo de fichas (`Treino/*.md`).
- **Nada de dados pessoais do vault entra neste repositório, que é público:** peso, saúde,
  fotos, alimentação, cargas. No `treino.toml` só vão nomes de exercícios, séries,
  alvo de reps, aquecimento, bi-set, Plano B e observações de execução.
- Ao mexer no vault, siga as regras dele (`git pull` antes, commit e push na `main` no fim).
