# Documentação técnica — Plataforma Mutirões UNICAMP

Para quem vai manter ou alterar o código. A explicação geral, para não programadores, está no [README](../README.md).

**Tecnologias:** front-end React + Vite + TypeScript, publicado no GitHub Pages; banco, login e regras de acesso no [Supabase](https://supabase.com) (PostgreSQL, Auth e RLS).

## Modelo de acesso

- **Alunos e voluntários não fazem login.** Consultam, inscrevem-se, cancelam e pedem validação **pelo RA**, por funções RPC `SECURITY DEFINER` em `public` (`consultar_ra`, `listar_eventos_abertos`, `inscrever_publico`, `cancelar_inscricao_publico`, `solicitar_validacao_publico`). As que alteram dados conferem o e-mail cadastrado. A consulta devolve só o primeiro nome, nunca e-mail ou telefone.
- **Organização:** RA + senha no Supabase Auth, com o e-mail técnico `admin.<RA>@mutiroes.invalid`, que nunca recebe mensagens. Um gatilho em `auth.users` só deixa criar conta quem tem convite em aberto em `convites_admin`, e cria a linha em `organizadores` com nome, cargo e papel.
- **Papéis:** `organizador` faz a gestão do dia a dia; `admin` também gerencia a equipe. O banco impede remover ou rebaixar o último admin.
- **Cargos com efeito no banco:** só Capitã(o) e Vice-capitã(o) (`privado.cargo_valida`) leem e decidem `solicitacoes_validacao`. Só eles atribuem ou retiram esses cargos, em membros e em convites. Os demais organizadores veem os totais pelo `saldo_horas`.
- **Tabelas:** o RLS libera leitura e escrita só para a organização; o público passa pelas funções. Além disso, os GRANTs são explícitos e o acesso de `anon` é revogado nas tabelas sensíveis.
- **Advisors:** os avisos `*_security_definer_function_executable` nas funções públicas são intencionais, porque elas são a interface pública.

## Modelo de dados

```
participantes ─┬─< inscricoes >── eventos ──> categorias_evento
   │           ├─< ajustes_horas
   └─> cursos  └─< solicitacoes_validacao
organizadores (papel: organizador | admin; cargo) <── convites_admin (por RA)
saldo_horas (view): acumuladas = presenças + ajustes; disponíveis = acumuladas − validadas − pendentes
```

As horas **nunca são digitadas**: a view `saldo_horas` calcula tudo. Os ajustes manuais ficam em `ajustes_horas`, com motivo e autor. Detalhes em [`supabase/migrations/`](../supabase/migrations/).

## Estrutura

```
supabase/
  migrations/          esquema SQL + funções RPC (aplicadas em ordem; nunca editar uma já aplicada em produção)
  tests/               teste de RLS (dados fictícios) e teste de API (Supabase local, Auth real)
  config.toml          Supabase LOCAL (portas 553xx); não usar `config push` com ele
scripts/
  migracao/            análise de consistência e importação das planilhas antigas
site/                  front-end React (src/pages/publico, src/pages/admin)
  .env.production      URL e chave PUBLICÁVEL de produção (públicas por natureza)
docs/                  esta documentação
.github/workflows/     publicação automática no GitHub Pages a cada push em main
```

## Desenvolvimento

```bash
cd site
cp .env.example .env.local     # aponte para o Supabase local ou de testes
npm ci
npm run dev                    # http://localhost:5173/Site-oficial_Mutiroes-UNICAMP/
npm run build                  # checagem de tipos + build
```

Supabase local e testes (requerem Docker):

```bash
npx supabase start                                           # banco + Auth locais; Studio em http://127.0.0.1:55323
python3 -I scripts/migracao/importar.py /caminho/para/Data   # gera Data/saida/importacao.sql
bash supabase/tests/run.sh                                   # RLS e RPCs, dados fictícios
bash supabase/tests/api/run_api.sh /caminho/para/Data        # chamadas do site com Auth real (recria o banco local)
```

Ao mudar o esquema: crie uma **nova** migration, atualize `site/src/lib/tipos.ts`, rode os testes e os advisors (`npx supabase db advisors`) e aplique em produção com `npx supabase db push --remote`.

## Produção

| | |
|---|---|
| Site | https://mutiroes-unicamp.github.io/Site-oficial_Mutiroes-UNICAMP/ (GitHub Pages, conta `mutiroes-unicamp`) |
| Supabase | projeto **Site Oficial** (`klkfgmnfvafojyqdnddg`), na conta do Mutirões, região us-west-2 |
| Auth | Email ligado; *Allow new users to sign up* **ligado** (o banco recusa quem não tem convite); *Confirm email* **desligado**; senha mínima de 8 |

- **Primeiro admin** de um projeto novo, pelo SQL Editor: `insert into public.convites_admin (ra, nome, cargo, papel) values ('<RA>', '<Nome>', 'Capitã', 'admin');` Depois, no site: *Acessar como administrador › Primeiro acesso*.
- **Configuração do Auth:** para alterar por CLI, use um `config.toml` separado, só com as opções de produção (`config diff` antes de `config push`). O `supabase/config.toml` do repositório é o do ambiente local.
- **Backups e reimportação:** `npx supabase db dump --remote [--data-only --use-copy] -s public -f <arquivo>`. Os arquivos ficam **fora do repositório** (ex.: `Data/backups/`). Para reimportar a partir da planilha, apague os dados mantendo `organizadores`, `convites_admin` e `auth.users`, e rode o `importacao.sql`, que confere as horas e desfaz tudo se houver divergência.

## Dados pessoais

O repositório é **público**. Planilhas, CSVs, dumps e relatórios de importação **nunca** são versionados (ver [`.gitignore`](../.gitignore)). Nunca coloque a *secret key* nem a `service_role` no código.
