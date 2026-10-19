'use client';

import { Database } from 'lucide-react';
import { Checklist, Result, Section } from './tracking-help-support';

export function renderInfrastructureHelp() {
  return (
    <Section
      id="railway"
      number="01"
      title="Infraestrutura automática"
      subtitle="Banco, migrations e criptografia são administrados pelo próprio TMXHUB."
      icon={<Database className="h-5 w-5" />}
    >
      <Checklist
        items={[
          {
            id: 'managed-db',
            content:
              'O PostgreSQL é provisionado uma única vez pela operação do TMXHUB e fica disponível para todas as ofertas autorizadas.',
          },
          {
            id: 'managed-migrations',
            content:
              'As migrations são executadas automaticamente antes de cada inicialização da API.',
          },
          {
            id: 'managed-health',
            content:
              'A própria tela mostra a saúde do banco, da estrutura e da criptografia. Você não precisa acessar o Railway.',
          },
        ]}
      />
      <Result
        title="Nenhuma ação externa necessária"
        detail="Se algum componente ficar indisponível, o TMXHUB exibe o diagnóstico e a operação técnica corrige a infraestrutura sem expor credenciais."
      />
    </Section>
  );
}
