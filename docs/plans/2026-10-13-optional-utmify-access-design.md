# Acesso opcional à dashboard UTMify no cadastro

Checkbox desmarcado por padrão, independente do envio de vendas e eventos via API. Sem acesso: não enviar/armazenar credenciais, não sincronizar nem consultar capacidades autenticadas. Permissão explícita persiste na oferta e protege os serviços antes de login. Ofertas existentes preservam comportamento para evitar interromper configurações previamente autorizadas. Adicionar credenciais posteriormente autoriza o acesso à dashboard.

O timer de importação por login/senha já está desativado; os workers de pedidos/eventos seguem independentes. O cadastro com acesso exige dashboard, login e senha; sem acesso exige apenas identificação da empresa/oferta.
