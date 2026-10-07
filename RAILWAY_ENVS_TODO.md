# Railway — Variáveis de Ambiente a Configurar

> Este arquivo é só o roteiro. **Não contém valores sensíveis.**
> Cole os valores reais manualmente no painel do Railway.

---

## Como acessar

1. Acesse [railway.app](https://railway.app) e abra o projeto **TMX-HUB**.
2. Clique no serviço **api** (não no Redis nem no Postgres).
3. Na aba **Variables**, clique em **New Variable** para cada item abaixo.

---

## Variáveis obrigatórias para o fluxo de convite (Brevo)

| Variável | Valor |
|---|---|
| `BREVO_API_KEY` | A chave gerada no painel do Brevo (Iago cola aqui) |
| `BREVO_SENDER_EMAIL` | `convites@theminex.com` |
| `BREVO_SENDER_NAME` | `TMX Hub` |
| `INVITE_ACCEPT_URL_BASE` | `https://app.theminex.com/register` |

> **`INVITE_ACCEPT_URL_BASE`**: o backend anexa `?invite=TOKEN` ao final.
> A página `/register` já lê `?invite=` de `window.location.search`.

---

## Variáveis de segurança obrigatórias (PRE_DEPLOY_AUDIT)

| Variável | Valor |
|---|---|
| `JWT_SECRET` | String aleatória com **≥ 32 caracteres** — gere com `openssl rand -base64 32` |

> ⚠️ O servidor **não sobe** sem `JWT_SECRET`. Gere no terminal e cole no Railway.

---

## DNS / autenticidade de e-mail no Brevo (antes do primeiro envio em prod)

Antes de enviar qualquer e-mail real, configure os registros DNS do domínio `theminex.com`
no Brevo para garantir entrega e reputação:

1. No painel do Brevo: **Senders & IPs → Domains → Add a domain** → `theminex.com`.
2. Brevo mostrará registros **SPF** e **DKIM** para adicionar no DNS do domínio.
3. Adicione os registros no provedor DNS de `theminex.com` (Cloudflare, etc.).
4. Clique em **Verify** no Brevo após propagação (pode levar até 48h).
5. Só então o envio de `convites@theminex.com` terá autenticidade completa.

---

## Conferência pós-configuração

Após setar todas as vars acima, faça um deploy e teste o fluxo:
1. Como admin, vá em **Configurações → Membros → Convidar**.
2. Envie convite para um e-mail real.
3. Confirme que o e-mail chegou com link `https://app.theminex.com/register?invite=TOKEN`.
4. Acesse o link e complete o cadastro.
