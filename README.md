# Plataforma Mutirões UNICAMP

Plataforma do projeto de extensão **Mutirões UNICAMP** para centralizar:

- **inscrição** dos voluntários nos eventos, com formulário configurável por evento (substitui os Google Forms);
- **lista de presença** no dia do evento, pelo celular;
- **consulta e validação de horas** de extensão (substitui o [Sistema-de-Consulta](https://github.com/mutiroes-unicamp/Sistema-de-Consulta));
- futuramente, **emissão de certificados** com código de verificação.

Front-end React + Vite + TypeScript (GitHub Pages) + [Supabase](https://supabase.com) (PostgreSQL, Auth e RLS).

> **Status:** banco, importação e site prontos e testados localmente; falta aplicar no Supabase e publicar (ver [Colocar no ar](#colocar-no-ar-uma-vez)).

## Funcionalidades

**Aluno / voluntário** (login sem senha, por link no e-mail)
- vê horas acumuladas, validadas, em análise e disponíveis, e cada participação com sua situação;
- inscreve-se em eventos abertos (com lista de espera automática quando lota) e cancela antes do evento;
- solicita validação de horas (no máximo o saldo disponível; uma solicitação por vez);
- quem já participava pelos Forms recupera o histórico entrando com o mesmo e-mail.

**Organização**
- cria eventos com vagas, prazo e perguntas próprias (modelos prontos: carona, créditos de extensão);
- acompanha inscrições e respostas, inclui pessoas manualmente e exporta CSV;
- marca presença no dia (tela para celular), inclusive de quem apareceu sem inscrição;
- aprova ou recusa validações; faz ajustes manuais de horas com motivo;
- consulta e edita todos os dados de participantes; visão **Planilha** (participantes × eventos) igual ao antigo Controle de Horas, exportável;
- admins gerenciam a equipe.

## Por que sair da planilha

A planilha "Controle de Presença" liga nomes e horas **por posição** (linha *n* do controle ↔ linha *n* do cadastro; coluna *k* ↔ linha *k* de Eventos). Ordenar ou inserir uma linha transfere horas entre pessoas sem aviso. Além disso, ajustes manuais de horas ficavam escondidos dentro das fórmulas. No banco:

- cada inscrição é **uma linha** com chave estrangeira para participante e evento;
- **horas nunca são digitadas** — a view `saldo_horas` calcula a partir das presenças, ajustes e validações;
- ajustes manuais ficam em `ajustes_horas`, com motivo e autor;
- RLS garante que cada aluno vê só os próprios dados e que só a organização registra presença.

## Modelo de dados

```
participantes ─┬─< inscricoes >── eventos ──> categorias_evento
   │           ├─< ajustes_horas
   └─> cursos  └─< solicitacoes_validacao
organizadores (papéis: organizador | admin)
saldo_horas (view): acumuladas = presenças + ajustes; disponíveis = acumuladas − validadas − pendentes
```

Detalhes e políticas de acesso: [`supabase/migrations/`](supabase/migrations/).

## Estrutura

```
supabase/
  migrations/          esquema SQL + funções RPC (aplicar em ordem)
  tests/               teste do RLS (dados fictícios) e teste de API (PostgREST)
scripts/
  migracao/            análise de consistência e importação das planilhas antigas
site/                  front-end React (src/pages/aluno, src/pages/admin)
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

Testes do banco (requerem Docker):

```bash
bash supabase/tests/run.sh                                   # RLS e RPCs, dados fictícios
python3 -I scripts/migracao/importar.py /caminho/para/Data   # gera Data/saida/importacao.sql
bash supabase/tests/api/run_api.sh "$PWD" /caminho/para/Data # consultas do site contra PostgREST
```

Ao mudar o esquema: crie uma nova migration em `supabase/migrations/`, atualize `site/src/lib/tipos.ts` e rode os testes.

## Colocar no ar (uma vez)

1. **Banco:** aplicar `supabase/migrations/*.sql` em ordem no projeto Supabase e rodar os *advisors* de segurança.
2. **Dados:** gerar `importacao.sql` com `scripts/migracao/importar.py` e executá-lo (a transação se desfaz sozinha se as horas não baterem com a planilha). Ler `Data/saida/relatorio_importacao.md` com a organização.
3. **Primeiro admin:** entrar uma vez no site e, no SQL Editor:
   `insert into public.organizadores select id, 'admin' from auth.users where email = '<e-mail>';`
   Os demais membros são adicionados pela tela *Equipe*.
4. **Auth (Supabase › Authentication):**
   - *URL Configuration*: Site URL e Redirect URLs = endereço do site no Pages;
   - *SMTP*: configurar um SMTP próprio (o padrão do Supabase envia pouquíssimos e-mails por hora e não permite editar os modelos no plano gratuito);
   - *Email Templates › Magic Link*: incluir `{{ .Token }}` para o aluno poder digitar o código se o link não funcionar.
5. **GitHub:** *Settings › Pages › Source: GitHub Actions*; em *Settings › Secrets and variables › Actions › Variables* criar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Cada push em `main` publica o site.

## Autoria

- Plataforma: **<!-- seu nome, link e cargo -->**
- Sistema de consulta original (2026): **Gabriel Vieira** ([LinkedIn](https://www.linkedin.com/in/gabriel-vieira-caldana/)) — Vice-capitão

Projeto mantido pela equipe do Mutirões UNICAMP.
