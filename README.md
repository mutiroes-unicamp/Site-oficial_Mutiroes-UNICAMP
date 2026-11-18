# Plataforma Mutirões UNICAMP

Plataforma do projeto de extensão **Mutirões UNICAMP** para centralizar:

- **inscrição** dos voluntários nos eventos, com formulário configurável por evento (substitui os Google Forms);
- **lista de presença** no dia do evento, pelo celular;
- **consulta e validação de horas** de extensão (substitui o [Sistema-de-Consulta](https://github.com/mutiroes-unicamp/Sistema-de-Consulta));
- futuramente, **emissão de certificados** com código de verificação.

Front-end React + Vite + TypeScript (GitHub Pages) + [Supabase](https://supabase.com) (PostgreSQL, Auth e RLS).

> **Status:** banco, importação e site prontos e testados localmente; falta aplicar no Supabase e publicar (ver [Colocar no ar](#colocar-no-ar-uma-vez)).

## Funcionalidades

**Aluno / voluntário** (sem login — pelo RA)
- consulta pelo RA as horas acumuladas, validadas, em análise e disponíveis, e cada participação com sua situação;
- inscreve-se em eventos abertos (lista de espera automática quando lota) e cancela antes do evento;
- solicita validação de horas (no máximo o saldo disponível; uma solicitação por vez);
- comunidade externa (sem RA) se inscreve pelo e-mail;
- para **inscrever, cancelar ou pedir validação** é preciso informar o e-mail cadastrado (só conferência, nada é enviado). A consulta mostra só o primeiro nome, nunca e-mail ou telefone.

**Organização**
- cria eventos com vagas, prazo e perguntas próprias (modelos prontos: carona, créditos de extensão);
- acompanha inscrições e respostas, inclui pessoas manualmente e exporta CSV;
- marca presença no dia (tela para celular), inclusive de quem apareceu sem inscrição;
- aprova ou recusa validações; faz ajustes manuais de horas com motivo;
- consulta e edita todos os dados de participantes; visão **Planilha** (participantes × eventos) igual ao antigo Controle de Horas, exportável;
- admins gerenciam a equipe: convidam pelo RA, mudam papéis, redefinem acesso de quem esqueceu a senha.

**Acesso da organização:** "Acessar como administrador" com **RA + senha**. Só cria acesso quem tem convite de um admin; o convidado define a própria senha em *Primeiro acesso*. (Por baixo, o Supabase Auth usa o e-mail técnico `admin.<RA>@mutiroes.invalid`, que nunca recebe e-mail.)

## Por que sair da planilha

A planilha "Controle de Presença" liga nomes e horas **por posição** (linha *n* do controle ↔ linha *n* do cadastro; coluna *k* ↔ linha *k* de Eventos). Ordenar ou inserir uma linha transfere horas entre pessoas sem aviso. Além disso, ajustes manuais de horas ficavam escondidos dentro das fórmulas. No banco:

- cada inscrição é **uma linha** com chave estrangeira para participante e evento;
- **horas nunca são digitadas** — a view `saldo_horas` calcula a partir das presenças, ajustes e validações;
- ajustes manuais ficam em `ajustes_horas`, com motivo e autor;
- as tabelas são lidas e alteradas só pela organização (RLS); o público passa por funções que expõem o mínimo.

## Modelo de dados

```
participantes ─┬─< inscricoes >── eventos ──> categorias_evento
   │           ├─< ajustes_horas
   └─> cursos  └─< solicitacoes_validacao
organizadores (papéis: organizador | admin) <── convites_admin (por RA)
saldo_horas (view): acumuladas = presenças + ajustes; disponíveis = acumuladas − validadas − pendentes
```

Detalhes e políticas de acesso: [`supabase/migrations/`](supabase/migrations/).

## Estrutura

```
supabase/
  migrations/          esquema SQL + funções RPC (aplicar em ordem)
  tests/               teste do RLS (dados fictícios) e teste de API (Supabase local)
  config.toml          Supabase local (portas 553xx)
scripts/
  migracao/            análise de consistência e importação das planilhas antigas
site/                  front-end React (src/pages/publico, src/pages/admin)
.github/workflows/     publicação automática no GitHub Pages
```

## Dados pessoais (LGPD)

Este repositório é **público**. Planilhas, CSVs e backups com dados de participantes **nunca** são versionados (ver [`.gitignore`](.gitignore)) — ficam apenas na máquina de quem faz a migração. Os scripts de análise imprimem só contagens.

Nunca coloque a chave `service_role` do Supabase no código ou no repositório.

## Desenvolvimento

```bash
cd site
cp .env.example .env.local     # preencha a URL e a publishable key do Supabase
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

Ao mudar o esquema: crie uma nova migration em `supabase/migrations/`, atualize `site/src/lib/tipos.ts` e rode os testes.

## Colocar no ar (uma vez)

1. **Banco:** aplicar `supabase/migrations/*.sql` em ordem no projeto Supabase e rodar os *advisors* de segurança.
2. **Dados:** gerar `importacao.sql` com `scripts/migracao/importar.py` e executá-lo (a transação se desfaz sozinha se as horas não baterem com a planilha). Ler `Data/saida/relatorio_importacao.md` com a organização.
3. **Auth (Supabase › Authentication › Sign In / Providers › Email):** manter *Email* ligado, *Allow new users to sign up* **ligado** (o banco recusa quem não tem convite) e **desligar *Confirm email*** (os e-mails técnicos não recebem mensagens). Senha mínima: 8 caracteres.
4. **Primeiro admin**, no SQL Editor:
   `insert into public.convites_admin (ra, nome, papel) values ('<RA>', '<Nome>', 'admin');`
   Depois, no site: *Acessar como administrador › Primeiro acesso* com esse RA. Os demais membros são convidados pela tela *Equipe*.
5. **GitHub:** *Settings › Pages › Source: GitHub Actions*; em *Settings › Secrets and variables › Actions › Variables* criar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Cada push em `main` publica o site.

## Autoria

- Plataforma: **Brunna Santella Souza** ([LinkedIn](https://www.linkedin.com/in/brunna-santella/)) - Capitã
- Sistema de consulta original (2026): **Gabriel Vieira** ([LinkedIn](https://www.linkedin.com/in/gabriel-vieira-caldana/)) — Vice-capitão

Projeto mantido pela equipe do Mutirões UNICAMP.
