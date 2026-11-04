'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Activity,
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Target,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './reference.module.css';

export function LoginSpecimen({ motion }: { motion: boolean }) {
  const [email, setEmail] = useState('demo@tmx.local');
  const [password, setPassword] = useState('tmx-demo');
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fail, setFail] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [entry, setEntry] = useState(0);
  const [eyes, setEyes] = useState({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (state === 'success') successRef.current?.focus();
  }, [state]);
  const restart = () => {
    clearTimeout(timer.current);
    setState('idle');
    setEmailError('');
    setPasswordError('');
    setMessage('');
    setEmail('demo@tmx.local');
    setPassword('tmx-demo');
    setShown(false);
    setFocused(false);
    setEyes({ x: 0, y: 0 });
    setEntry((value) => value + 1);
  };
  const busy = state === 'loading';
  return (
    <div>
      <div className={styles.row}>
        <Button
          variant="outline"
          className={styles.secondary}
          disabled={busy}
          aria-pressed={fail}
          onClick={() => setFail(!fail)}
        >
          Resultado: {fail ? 'Falha simulada' : 'Sucesso simulado'}
        </Button>
        <Button variant="outline" className={styles.secondary} onClick={restart}>
          <RotateCcw aria-hidden />
          Repetir entrada do login
        </Button>
      </div>
      <p className={styles.caption}>
        Use somente os dados fictícios preenchidos. Nada é enviado ou armazenado; nenhuma sessão é
        criada.
      </p>
      <div key={entry} className={styles.loginExample}>
        <div
          className={styles.loginHero}
          onPointerMove={(event) => {
            if (
              !motion ||
              event.pointerType !== 'mouse' ||
              window.matchMedia('(prefers-reduced-motion: reduce)').matches
            )
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            setEyes({
              x: Math.max(-3, Math.min(3, (event.clientX - rect.left - rect.width / 2) / 40)),
              y: Math.max(-2, Math.min(2, (event.clientY - rect.top - rect.height / 2) / 50)),
            });
          }}
          onPointerLeave={() => setEyes({ x: 0, y: 0 })}
        >
          <div className={styles.loginBrand}>
            <span>
              <Activity aria-hidden />
            </span>
            TMX HUB
          </div>
          <div className={styles.loginArt}>
            <span className={styles.loginOrbit} aria-hidden />
            <span className={styles.loginOrbitSecond} aria-hidden />
            <div className={`${styles.loginMiniCard} ${styles.loginMiniA}`}>
              <ChartNoAxesCombined aria-hidden />
              <span>
                Visão geral<small>Resultados em um só lugar</small>
              </span>
            </div>
            <div className={`${styles.loginMiniCard} ${styles.loginMiniB}`}>
              <Target aria-hidden />
              <span>
                Rastreamento<small>Cada etapa da jornada</small>
              </span>
            </div>
            <div className={`${styles.loginMiniCard} ${styles.loginMiniC}`}>
              <CreditCard aria-hidden />
              <span>
                Financeiro<small>Sua operação organizada</small>
              </span>
            </div>
            <div
              className={styles.loginOrb}
              data-shy={focused && !shown}
              data-happy={state === 'success'}
              aria-hidden="true"
            >
              <div
                className={styles.loginEyes}
                style={{ transform: `translate(${eyes.x}px, ${eyes.y}px)` }}
              >
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className={styles.loginHeroCopy}>
            <h3>
              Sua operação,
              <br />
              em uma só visão.
            </h3>
            <p>
              Ofertas, rastreamento, equipe e resultados.
              <br />
              Seu terminal de controle começa aqui.
            </p>
          </div>
          <small className={styles.loginFoot}>TMX HUB · Terminal de Controle</small>
        </div>
        <div className={`${styles.loginCard} ${styles.formStack}`}>
          <div className={styles.loginPanelInner}>
            <span className={styles.loginDemoTag}>Preview interativo · sem autenticação real</span>
            {state === 'success' ? (
              <div className={styles.loginStep}>
                <Check className={styles.loginSuccess} aria-hidden />
                <h3 ref={successRef} tabIndex={-1}>
                  Tudo pronto.
                </h3>
                <p>Login demonstrativo concluído. Nenhuma sessão foi criada.</p>
                <Button className={styles.primary} onClick={restart}>
                  Repetir demonstração
                </Button>
              </div>
            ) : (
              <form
                className={`${styles.formStack} ${styles.loginStep}`}
                noValidate
                aria-label="Login demonstrativo"
                aria-busy={busy}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  const invalidEmail = !email.trim() || !emailRef.current?.validity.valid;
                  const invalidPassword = !password.trim();
                  setEmailError(
                    invalidEmail ? 'Informe um e-mail no formato nome@empresa.com.' : '',
                  );
                  setPasswordError(invalidPassword ? 'Preencha a senha de exemplo.' : '');
                  setMessage('');
                  if (invalidEmail || invalidPassword) {
                    setState('idle');
                    (invalidEmail ? emailRef : passwordRef).current?.focus();
                    return;
                  }
                  setState('loading');
                  timer.current = setTimeout(() => setState(fail ? 'error' : 'success'), 650);
                }}
              >
                <h3>Bom ter você de volta.</h3>
                <p className={styles.caption}>
                  Entre com seu e-mail e senha para continuar.
                  <br />
                  Use os dados de exemplo já preenchidos.
                </p>
                <FormField id="reference-login-email" label="E-mail" error={emailError}>
                  <Input
                    ref={emailRef}
                    className={styles.input}
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    disabled={busy}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailError('');
                      if (state === 'error') setState('idle');
                    }}
                  />
                </FormField>
                <div className={styles.loginPassword}>
                  <button
                    type="button"
                    className={styles.loginRecover}
                    disabled={busy}
                    onClick={() =>
                      setMessage('Recuperação ilustrativa: nenhum e-mail foi enviado.')
                    }
                  >
                    Esqueceu sua senha?
                  </button>
                  <FormField id="reference-login-password" label="Senha" error={passwordError}>
                    <Input
                      ref={passwordRef}
                      className={styles.input}
                      type={shown ? 'text' : 'password'}
                      autoComplete="off"
                      required
                      disabled={busy}
                      value={password}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setPasswordError('');
                        if (state === 'error') setState('idle');
                      }}
                    />
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    className={styles.loginEyeToggle}
                    disabled={busy}
                    aria-label={shown ? 'Ocultar senha de exemplo' : 'Mostrar senha de exemplo'}
                    aria-pressed={shown}
                    onClick={() => setShown(!shown)}
                  >
                    {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                </div>
                {state === 'error' && (
                  <p role="alert" className={styles.loginError}>
                    Não foi possível entrar. E-mail ou senha não conferem nesta simulação. Revise os
                    dados e tente novamente.
                  </p>
                )}
                <Button type="submit" className={styles.primary} disabled={busy}>
                  {busy ? 'Entrando…' : 'Entrar · demonstração'}
                  {busy ? (
                    <Loader2 className={styles.loginSpinner} aria-hidden />
                  ) : (
                    <ArrowRight aria-hidden />
                  )}
                </Button>
                <div className={styles.loginAccess}>
                  Não tem conta?{' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setMessage('Solicitação ilustrativa: nenhum pedido de acesso foi enviado.')
                    }
                  >
                    Solicitar acesso
                  </button>
                </div>
                <output className={styles.caption}>
                  {message || (busy ? 'Simulando acesso, aguarde.' : '')}
                </output>
              </form>
            )}
            <p className={styles.loginDisclaimer}>
              Esta prévia não envia nem armazena credenciais. Não use sua senha real. O acesso é
              demonstrado somente com e-mail e senha.
            </p>
          </div>
        </div>
      </div>
      <p className={styles.caption}>
        Entrada: 800ms. Etapa de sucesso: 450ms. Movimento reduzido desativa efeitos; carregamento
        de 650ms é apenas simulação.
      </p>
    </div>
  );
}
