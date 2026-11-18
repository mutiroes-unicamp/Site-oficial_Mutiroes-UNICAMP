# Plataforma Mutirões UNICAMP

O site oficial do projeto de extensão **Mutirões UNICAMP**. Nele, quem participa das ações acompanha suas horas de extensão e se inscreve nos próximos eventos. A organização usa o mesmo site para cuidar de inscrições, presenças e validação de horas.

### 👉 [mutiroes-unicamp.github.io/Site-oficial_Mutiroes-UNICAMP](https://mutiroes-unicamp.github.io/Site-oficial_Mutiroes-UNICAMP/)

> **Status (novembro/2026):** em teste pela equipe administrativa. Durante os testes, a planilha "Controle de Presença" continua sendo o registro oficial. Depois, os dados de teste serão descartados e o site será recarregado a partir da planilha atualizada.

---

## O que mudou

Antes, cada evento tinha um Google Forms, e as presenças e horas eram controladas numa planilha. Funcionava, mas era frágil. Ordenar a planilha, por exemplo, podia trocar as horas de uma pessoa com as de outra sem ninguém perceber.

Agora fica tudo num só lugar:

- **Inscrição pelo próprio site**, com um formulário próprio para cada evento.
- **Lista de presença pelo celular** no dia do evento.
- **Horas calculadas automaticamente** a partir das presenças. Ninguém digita horas à mão, então elas não ficam desatualizadas nem com erro de digitação.
- **Pedido e aprovação de validação de horas** dentro do site.
- **Todo o histórico da planilha foi trazido para o site:** os 248 participantes, os 72 eventos desde 2025 e as horas de cada pessoa, conferidas uma a uma com a planilha.

---

## Para participantes

Não precisa de login nem de senha. **Tudo funciona pelo RA.**

### Consultar minhas horas
Na página inicial, digite seu RA em **"Consultar minhas horas"**. Você vê:
- **horas acumuladas**: soma dos eventos em que sua presença foi registrada;
- **horas já validadas**;
- **horas em análise**: pedidos que a organização ainda não respondeu;
- **horas disponíveis para validar**;
- a lista dos eventos de que você participou, com a situação de cada um.

### Inscrever-se num evento
Na página inicial, escolha o evento e clique em **"Quero participar"**.
- **Já participou antes?** Digite o RA e confirme o e-mail que você usou nas inscrições anteriores.
- **Primeira vez?** Preencha um cadastro rápido.
- **Não é aluno(a) da Unicamp?** Escolha "Comunidade externa" e inscreva-se com seu e-mail.
- **Evento lotado?** Você entra na **lista de espera** e é chamado(a) automaticamente se alguém cancelar.

### Cancelar uma inscrição
Na consulta pelo RA, clique em **"cancelar"** ao lado do evento. Isso é possível até o horário de início.

### Pedir a validação das horas
Na consulta pelo RA, use **"Solicitar validação de horas"**: informe quantas horas quer validar e confirme seu e-mail. A organização analisa o pedido, e o resultado aparece na própria consulta.

> **Por que o site pede meu e-mail?** Para ter certeza de que é você quem está pedindo. Nenhuma mensagem é enviada. O e-mail serve só para conferir com o seu cadastro. Por isso, outra pessoa que saiba o seu RA não consegue se inscrever, cancelar ou pedir validação no seu lugar.

---

## Para a organização

Use o botão **"Acessar como administrador"** no topo do site e entre com **RA + senha**.

### Primeiro acesso
Para entrar na equipe, é preciso um **convite**. Um administrador convida você pelo seu RA. Depois, abra **Acessar como administrador › Primeiro acesso**, digite seu RA e escolha a sua senha, com pelo menos 8 caracteres. O convite vale por 7 dias.

### O que dá para fazer

| Tela | Para que serve |
|---|---|
| **Painel** | Resumo geral: próximos eventos, inscrições abertas e avisos (por exemplo, um evento que já aconteceu e ainda não teve a presença confirmada). |
| **Eventos** | Criar e editar eventos: data, local, horas, número de vagas e prazo de inscrição. Cada evento tem seu **formulário de inscrição**, com modelos prontos de perguntas (carona, créditos de extensão) e perguntas próprias. |
| **Detalhe do evento** | Ver quem se inscreveu e as respostas, incluir alguém manualmente e **exportar a lista em CSV** (abre no Excel ou no Sheets). |
| **Lista de presença** | Feita para usar **no celular, no dia do evento**: um toque em "Presente" ou "Faltou". Quem apareceu sem inscrição também pode ser adicionado. As horas entram na hora no saldo da pessoa. |
| **Participantes** | Busca e ficha completa de cada pessoa: dados de cadastro, participações e horas. Também permite **ajustes manuais de horas**, sempre com o motivo registrado. |
| **Planilha** | A mesma visão do antigo "Controle de Horas" (pessoas × eventos), sempre atualizada e exportável. |
| **Validações** | Aprovar ou recusar os pedidos de validação de horas. Ao recusar, você escreve o motivo, e o participante vê. |
| **Equipe** | Convidar membros, definir cargos e papéis, redefinir o acesso de quem esqueceu a senha e remover membros. |

### Quem pode o quê

| | Organizador | Administrador | Capitã(o) e Vice-capitã(o) |
|---|:---:|:---:|:---:|
| Eventos, inscrições e presenças | ✅ | ✅ | ✅ |
| Participantes, ajustes de horas e Planilha | ✅ | ✅ | ✅ |
| Gerenciar a equipe (convites, papéis, senhas) | — | ✅ | conforme o papel |
| **Validação de horas** | — | — | ✅ |
| Dar ou tirar os cargos de Capitã(o) e Vice-capitã(o) | — | — | ✅ |

**Esqueceu a senha?** Peça a um administrador para clicar em **"Redefinir senha"** na tela Equipe. Depois, faça o Primeiro acesso de novo e escolha uma senha nova. Para trocar sua senha quando quiser, clique no seu nome no topo do site.

---

## Onde tudo está hospedado

Tudo usa **serviços gratuitos** e está em contas **do próprio Mutirões**, não em contas pessoais. Assim, nada se perde quando a equipe muda.

| O quê | Onde | Quem administra |
|---|---|---|
| **O site** (as páginas que as pessoas veem) | **GitHub Pages**, no endereço acima | conta `mutiroes-unicamp` no GitHub |
| **Os dados** (participantes, eventos, presenças, horas) e os **acessos da organização** | **Supabase**, no projeto "Site Oficial". Os servidores ficam nos EUA. | conta do Mutirões no Supabase |
| **O código do site** | Este repositório no GitHub | conta `mutiroes-unicamp` |
| **Planilhas antigas e cópias de segurança** | Fora da internet, na máquina de quem cuida da migração | equipe responsável |

Cada alteração no código publica o site sozinho, em cerca de um minuto. Ninguém precisa subir arquivos à mão.

---

## Privacidade (LGPD)

- **RG e CPF não são guardados.** Alguns formulários antigos pediam esses dados, e eles não foram trazidos para o site.
- A consulta pelo RA mostra **só o primeiro nome** da pessoa, nunca e-mail ou telefone.
- Os dados completos dos participantes só ficam visíveis para quem faz parte da organização, com login.
- Este repositório é público, mas **não contém nenhum dado de participante**. Ele guarda apenas o código do site.
- **Para quem está na organização:** os dados que você vê são de pessoas reais. Use-os só para as atividades do Mutirões e não compartilhe listas exportadas fora da equipe.

---

## Dúvidas ou problemas

- **Participantes:** fale com a organização pelo e-mail **mutiroes@unicamp.br** ou pela comunidade do WhatsApp.
- **Equipe:** horas erradas, cadastro duplicado ou problema de acesso? Fale com a Capitã ou com o Vice-capitão.
- **Para quem vai mexer no código:** veja a [documentação técnica](docs/DESENVOLVIMENTO.md).

---

## Autoria

- Plataforma: **Brunna Santella Souza** ([LinkedIn](https://www.linkedin.com/in/brunna-santella/)), Capitã
- Sistema de consulta original (2026): **Gabriel Vieira** ([LinkedIn](https://www.linkedin.com/in/gabriel-vieira-caldana/)), Vice-capitão

Projeto mantido pela equipe do Mutirões UNICAMP.
