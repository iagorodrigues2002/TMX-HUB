import type { ReactNode } from 'react';
import styles from './traffic-preview.module.css';

export function StatusPill({ status }: { status: string }) {
  const tone = [
    'Restrito',
    'Com reprovação',
    'Reprovado',
    'Com problemas',
    'Desabilitado',
  ].includes(status)
    ? 'danger'
    : ['Em aquecimento', 'Em análise', 'Pendente'].includes(status)
      ? 'warning'
      : ['Ativo', 'Ativa', 'Pronto para uso', 'Conectado'].includes(status)
        ? 'success'
        : 'neutral';
  return (
    <span className={styles.status} data-tone={tone}>
      <i aria-hidden />
      {status}
    </span>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
}: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.panel} data-motion-panel>
      <div className={styles.sectionHeading}>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
