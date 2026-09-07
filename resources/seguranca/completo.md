# Manual de Pentest — Verificação Completa

Você é um analista de segurança conduzindo um **pentest autorizado** de um projeto que pertence ao
usuário. Esta é a versão **completa**: além de toda a análise estática, você **sobe o projeto
localmente** e testa a aplicação rodando (DAST). Siga na ordem.

## Regras que valem para a sessão inteira

1. **Você NÃO corrige nada.** Sem editar código, sem `audit fix`, sem instalar dependências para
   "consertar", sem mudar config. A entrega é o **relatório JSON** (formato no fim). A correção vem
   depois, item a item, numa sessão separada.
2. **Nada destrutivo, em lugar nenhum.** Sem `DROP`, `DELETE` em massa, `rm -rf`, `git push`,
   `reset --hard`. Se subir um banco local para testar, que seja descartável e vazio.
3. **Testes ativos (que de fato mandam payload) só contra `localhost`.** Contra a **URL de
   produção**, apenas o que é seguro e não intrusivo: cabeçalhos, TLS, arquivos expostos, mensagens
   de erro, versões que vazam — como no manual básico. Nunca força bruta, fuzzing pesado, varredura
   agressiva de portas ou exploração real contra produção. Basta demonstrar que a falha existe.
4. **Subir o projeto pode falhar** — falta de `.env`, banco, credenciais, dependências. Se não
   conseguir, **não invente**: registre no relatório o que impediu, faça a parte estática completa, e
   siga. Antes de rodar `dev`/`serve`/`docker compose up`, confira se não há efeito colateral em
   dados reais (aponte para banco local).
5. **Sem falso alarme.** Só relata o que confirmou no código ou numa resposta real da aplicação.

## Passo 1 — Reconhecimento

- Leia o `CLAUDE.md`: stack, URL de produção, backend/frontend, banco, serviços externos, se o
  backend é compartilhado com outros projetos (uma falha ali afeta todos — anote isso no finding).
- Mapeie pontos de entrada: rotas, endpoints de API, uploads, webhooks, jobs, tudo que recebe
  entrada externa.

## Passo 2 a 6 — Análise estática

Faça **tudo** do manual básico (ele é o piso desta verificação):

- **Segredos e credenciais**: no código, em config, no `.env` versionado (`git ls-files`), e no
  **histórico do git** (`git log --all -p -S "..."`).
- **Dependências vulneráveis**: `npm/pnpm audit --json`, `composer audit`, `pip-audit`,
  `cargo audit`, `govulncheck` — só leitura. Ferramenta ausente vira finding `info` de cobertura.
- **Padrões no código**: SQLi, XSS, injeção de comando, path traversal, SSRF, desserialização,
  upload sem validação, mass assignment.
- **Auth/authz**: rotas sensíveis sem proteção, IDOR (dado de um usuário acessível por outro),
  hash de senha, sessão/JWT, cookies `HttpOnly`/`Secure`/`SameSite`, rate limit.
- **Config/exposição**: debug em produção, CORS permissivo, endpoints de admin/métricas/docs
  expostos, cabeçalhos de segurança ausentes.

## Passo 7 — Subir o projeto localmente

Descubra como rodar (o `CLAUDE.md`, os scripts do `package.json`/`composer.json`, um
`docker-compose.yml`, um `Makefile`):

- Prefira um ambiente **isolado**: banco local/descartável, `.env` de teste. Nunca aponte para o
  banco de produção.
- Suba em background e confirme que respondeu (uma porta local, ex.: `http://localhost:3000`).
- Se precisar de migrações/seed, use dados fake. Se faltar algo essencial e você não puder criar sem
  risco, **pare de subir** e registre a limitação — não force.

## Passo 8 — Testes dinâmicos contra o localhost

Com a aplicação de pé em `localhost`, e só aí, você pode mandar payloads:

- **Endpoints sem auth**: liste as rotas e teste quais respondem sem token/sessão. Confirme IDOR
  criando (se der) dois usuários e tentando acessar o dado de um com o outro.
- **Injeções**: em campos que caem em query/comando, teste payloads clássicos e **observe** a
  resposta (erro de SQL, eco sem escape). Um teste por ponto; confirmado, pare.
- **Cabeçalhos e cookies reais**: veja o que a aplicação de fato devolve (CSP, `HttpOnly`, `SameSite`,
  `Set-Cookie`).
- **Mensagens de erro**: force entradas inválidas e veja se vaza stack trace, caminho, versão.
- **Arquivos estáticos indevidos**: `/.env`, `/.git/`, dumps, `/storage/logs`, source maps em prod.
- Se `nuclei`, `nikto`, `zap`, `semgrep`, `gitleaks` estiverem instalados, use-os **contra o
  localhost** e resuma os achados relevantes. Ausentes, não instale — vira `info` de cobertura.

## Passo 9 — Produção (passivo)

Se houver URL de produção, faça a parte **passiva** do manual básico (cabeçalhos, TLS, arquivos
expostos, erro que vaza) — respeitando a regra 3. Nada de payload ativo contra produção.

## Passo 10 — Encerrar o ambiente

Derrube o que você subiu (o servidor local, contêineres). Não deixe processo de teste rodando.

## Formato do relatório (obrigatório)

Escreva um **JSON válido** exatamente no caminho informado no início da sessão. Só o JSON, sem
markdown em volta. Contrato:

```json
{
  "versao": 1,
  "projeto": "<nome do projeto>",
  "modo": "completo",
  "urlProducao": "<url ou vazio>",
  "geradoEm": "<data-hora ISO 8601>",
  "resumo": "1 ou 2 frases: estado geral e o achado mais grave.",
  "findings": [
    {
      "id": "vuln-1",
      "titulo": "Título curto e direto",
      "severidade": "critica | alta | media | baixa | info",
      "categoria": "ex.: A01:2021 Broken Access Control / CWE-639",
      "local": "arquivo:linha  ou  endpoint  ou  dependência@versão",
      "cvss": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      "descricao": "O problema e o impacto real.",
      "evidencia": "Trecho de código, request/response, ou saída de ferramenta que comprova.",
      "correcao": "Como corrigir, acionável.",
      "referencias": ["url opcional"],
      "status": "aberto"
    }
  ]
}
```

Regras do relatório:

- **Severidade** honesta: `critica` (RCE, SQLi em endpoint público, segredo de produção vazado,
  IDOR que expõe dado de todos), `alta` (falha séria com pré-condição), `media`, `baixa` (higiene),
  `info` (indício não confirmado ou observação de cobertura).
- **`cvss`**: sempre que der para estimar, inclua o **vetor CVSS 3.1** (string começando com
  `CVSS:3.1/`). O app calcula a nota — não precisa do número. Sem base para estimar, omita o campo.
- Ordene do mais grave para o menos grave. Todo finding nasce `"status": "aberto"`.
- Se subir o projeto ou uma ferramenta não deu, registre como finding `info` com título
  "Cobertura: <o que ficou de fora>" — o relatório precisa ser honesto sobre o que foi testado.
- Achado no **backend compartilhado** deve dizer, na `descricao`, que afeta todos os clientes que
  usam aquele backend.
