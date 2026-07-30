# PRODUCT.md — TMX HUB

register: product

## Users

Gestor de tráfego pago e mesa de operação de direct response (Brasil), trabalhando com infoprodutos e nutra (Vendepay, UTMify, Meta Ads, TikTok Ads). Perfil sênior: escala campanhas de R$50k+/mês, olha ROAS e CPA de checkout em tempo real, migra creative-set rápido, tem impaciência baixa pra UI "genérica de SaaS analytics". Fluente em jargão de mídia paga (CBO, ABO, CPA IC, connect rate, VSL, presell, upsell, front, chargeback). Consome o painel em telas grandes (27"+ ou multi-monitor), quase sempre à noite, muitas abas abertas.

Módulo em foco (Trackeamento avançado): quem usa é a mesma pessoa, mas quando ela abre esse módulo o motivo é sempre um de três: (a) diagnosticar por que uma venda não apareceu na UTMify/Meta, (b) validar que uma oferta nova está trackeando ponta a ponta antes de escalar, (c) durante escala, olhar a saúde do pipeline (webhook, quarentena, entregas UTMify/Meta) e o front vs. upsell do dia.

## Product Purpose

Hub interno da agência (theminex.com). Uma tela por ferramenta. O módulo Trackeamento avançado é o mais crítico: substitui um patchwork de RedTrack/UTMify/Meta Events Manager pra dar visão first-party própria do funil clique → landing → checkout Vendepay → venda paga → entrega server-side pra UTMify e Meta CAPI, com quarentena, replay, dedup e classificação front/upsell.

## Brand voice

Tático, denso, sem gordura. Faz alarde só do que importa. Frases curtas, imperativas quando necessário. Português brasileiro exclusivamente na UI (não é bilíngue). Termos técnicos em inglês são mantidos quando são o vocabulário real do gestor (CBO, ROAS, CPA, InitiateCheckout, Purchase, front, upsell). O painel já tem hoje uma personalidade forte "TMX SIGNAL / FIRST-PARTY DATA / NEURAL-LOCK ENCRYPTION ACTIVE" que **fica**: não é adorno vazio, é o tom da casa.

Sem em-dashes. Sem "Vamos começar!". Sem exclamações. Sem cordialidade excessiva. Empty states dizem o que fazer, não desculpas.

## Anti-references

**Nunca parecer com:**

- Dashboards genéricos de SaaS de analytics (Metabase padrão, Amplitude, Mixpanel padrão). Card grid infinito de KPI, gráficos genéricos, laranja/roxo pastel.
- Painel administrativo Bootstrap-y (Metronic, AdminLTE, tema Tailwind UI padrão). "Cards com sombra suave e canto arredondado 16px".
- Hotmart / Kiwify / Monetizze / painel de plataforma de checkout brasileiro. Verde bonitinho, badges pastel, ilustrações 3D infantis, popups de "🎉 parabéns!".
- Google Analytics 4 / Meta Events Manager. Formulário-pesado, denso mas burocrático.
- SaaS "moderno" tipo Notion/Linear light mode. Muito branco, muito espaço, muita cordialidade.

**Segundo-nível (o que "não SaaS" costuma virar por reflexo — evitar também):**

- Editorial minimalista serif preto e branco (Bloomberg-lite). Errado aqui: gestor não está lendo artigo, está monitorando.
- Terminal ASCII-monospaced retrô fake. Errado: parece cosplay, não ferramenta séria.
- Neon cyberpunk saturado com glow em tudo. Errado: já é o clichê de "crypto trading dashboard".

## Strategic principles

1. **Densidade tática > respiração editorial.** O usuário quer ver muita coisa ao mesmo tempo, não uma métrica por tela. Cards são o último recurso; preferir tabelas, listas, HUD, quadrantes.
2. **A UI tem que se comportar como um sinal ao vivo, não como um relatório estático.** Estado atualiza, ping, pulso, indicador de "última leitura há X segundos" são parte da linguagem.
3. **Cor tem função, não decoração.** Verde/cyan = sinal saudável / medido. Âmbar = quarentena / precisa olhar. Vermelho = perda de dado real. Nunca gradiente decorativo.
4. **Mono como voz de máquina, sans como voz humana.** IDs, timestamps, deltas, valores brutos: monoespaçado. Rótulos, títulos, mensagens: sans.
5. **Movimento é contextual, não decorativo.** Pulso quando dado chega, transição quando estado muda, hover que revela mais informação. Nunca animação de entrada de página só pra ser bonito.
