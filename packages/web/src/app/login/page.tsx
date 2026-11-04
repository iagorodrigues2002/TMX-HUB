'use client';
import glass from '@/components/design-system/reference.module.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { loginDestination, loginFailure } from '@/lib/login-presentation';
import { useRouter } from '@/lib/motion-router';
import {
  Activity,
  ArrowRight,
  ChartNoAxesCombined,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import '@/components/design-system/reference-tokens.css';
import styles from './login.module.css';

export const dynamic = 'force-dynamic';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState('');
  const [theme, setTheme] = useState('dark');
  const [eyes, setEyes] = useState({ x: 0, y: 0 });
  const pending = useRef(false);
  useEffect(() => {
    if (
      process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' &&
      window.location.hostname === '127.0.0.1'
    ) {
      window.location.replace(
        `http://localhost:3120${window.location.pathname}${window.location.search}`,
      );
      return;
    }
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setError('');
    setHelp('');
    try {
      await login(email, password);
      toast.success('Login efetuado.');
      router.replace(loginDestination(search.get('next')));
    } catch (failure) {
      setError(loginFailure(failure));
      pending.current = false;
      setSubmitting(false);
    }
  };
  return (
    <main className={`tmx-glass-reference ${styles.root}`} data-theme={theme}>
      <svg
        className={styles.network}
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path d="M0 120L220 20 430 160 700 20 950 180 1200 50M0 120L170 360 430 160 510 450 700 20M170 360L0 650 310 740 510 450 780 620 950 180 1200 420M0 650L510 450 640 800M780 620L1200 780 1200 420 950 180M220 20L170 360M430 160L950 180M310 740L780 620" />
      </svg>
      <div className={`${glass.loginExample} ${styles.shell}`}>
        <section
          className={glass.loginHero}
          aria-label="TMX HUB"
          onPointerMove={(event) => {
            if (
              event.pointerType !== 'mouse' ||
              window.matchMedia('(prefers-reduced-motion: reduce)').matches
            )
              return;
            const box = event.currentTarget.getBoundingClientRect();
            setEyes({
              x: Math.max(-3, Math.min(3, (event.clientX - box.left - box.width / 2) / 40)),
              y: Math.max(-2, Math.min(2, (event.clientY - box.top - box.height / 2) / 50)),
            });
          }}
          onPointerLeave={() => setEyes({ x: 0, y: 0 })}
        >
          <Link href="/" className={glass.loginBrand}>
            <span>
              <Activity aria-hidden />
            </span>
            TMX HUB
          </Link>
          <div className={glass.loginArt}>
            <span className={glass.loginOrbit} aria-hidden />
            <span className={glass.loginOrbitSecond} aria-hidden />
            <div className={`${glass.loginMiniCard} ${glass.loginMiniA}`}>
              <ChartNoAxesCombined aria-hidden />
              <span>
                Visão geral<small>Resultados em um só lugar</small>
              </span>
            </div>
            <div className={`${glass.loginMiniCard} ${glass.loginMiniB}`}>
              <Target aria-hidden />
              <span>
                Rastreamento<small>Cada etapa da jornada</small>
              </span>
            </div>
            <div className={`${glass.loginMiniCard} ${glass.loginMiniC}`}>
              <CreditCard aria-hidden />
              <span>
                Financeiro<small>Sua operação organizada</small>
              </span>
            </div>
            <div className={glass.loginOrb} data-shy={focused && !shown} aria-hidden="true">
              <div
                className={glass.loginEyes}
                style={{ transform: `translate(${eyes.x}px, ${eyes.y}px)` }}
              >
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className={glass.loginHeroCopy}>
            <h2>
              Sua operação,
              <br />
              em uma só visão.
            </h2>
            <p>
              Ofertas, rastreamento, equipe e resultados.
              <br />
              Seu terminal de controle começa aqui.
            </p>
          </div>
          <small className={glass.loginFoot}>TMX HUB · Terminal de Controle</small>
        </section>
        <section className={glass.loginCard} aria-labelledby="login-title">
          <div className={glass.loginPanelInner}>
            <span className={glass.loginDemoTag}>Acesso à sua operação</span>
            <form
              onSubmit={(event) => void onSubmit(event)}
              className={`${glass.formStack} ${glass.loginStep}`}
              aria-busy={submitting}
            >
              <h1 id="login-title">Bom ter você de volta.</h1>
              <p className={glass.caption}>Entre com seu e-mail e senha para continuar.</p>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={submitting}
                  placeholder="voce@exemplo.com"
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
              <div className={glass.loginPassword}>
                <Label htmlFor="password">Senha</Label>
                <button
                  className={glass.loginRecover}
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    setHelp('Para recuperar seu acesso, fale com o administrador da sua empresa.')
                  }
                >
                  Esqueceu sua senha?
                </button>
                <Input
                  id="password"
                  type={shown ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  disabled={submitting}
                  aria-describedby={error ? 'login-error' : undefined}
                  placeholder="Sua senha"
                />
                <Button
                  className={glass.loginEyeToggle}
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={shown}
                  onClick={() => setShown(!shown)}
                >
                  {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
              {error && (
                <p id="login-error" role="alert" className={glass.loginError}>
                  {error}
                </p>
              )}
              <Button type="submit" disabled={submitting} className={styles.submit}>
                {submitting ? 'Entrando…' : 'Entrar'}
                {submitting ? (
                  <Loader2 className={glass.loginSpinner} aria-hidden />
                ) : (
                  <ArrowRight aria-hidden />
                )}
              </Button>
              <p className={glass.loginAccess}>
                Não tem conta? <Link href="/register">Solicitar acesso</Link>
              </p>
              <output className={glass.caption}>{help}</output>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <output className={styles.root} aria-label="Carregando login">
          <Loader2 aria-hidden />
        </output>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
