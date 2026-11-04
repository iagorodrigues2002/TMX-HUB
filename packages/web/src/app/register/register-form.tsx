'use client';

import { PublicSurface } from '@/components/hub/public-surface';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from '@/lib/motion-router';
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Form do registro. Lê `?invite=` de `window.location.search` num useEffect
 * ao invés de useSearchParams — no Next 15.5 essa hook mesmo dentro de
 * Suspense + dynamic='force-dynamic' ainda quebra o prerender do build
 * ('should be wrapped in a suspense boundary' após Suspense correto).
 * URLSearchParams direto elimina a issue e é 100% client-side.
 */
export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inviteState, setInviteState] = useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'valid'; email?: string; name?: string; expiresAt?: string; invitedBy?: string }
    | { kind: 'invalid'; detail: string }
  >({ kind: 'idle' });

  // Lê ?invite= uma vez no mount. Executa apenas no client, então é seguro.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get('invite');
    if (token) {
      setInviteToken(token);
      setInviteState({ kind: 'checking' });
    }
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.checkInvite(inviteToken);
        if (cancelled) return;
        if (!res.valid) {
          setInviteState({ kind: 'invalid', detail: res.detail ?? 'Convite inválido.' });
          return;
        }
        setInviteState({
          kind: 'valid',
          email: res.email,
          name: res.name,
          expiresAt: res.expiresAt,
          invitedBy: res.invitedBy,
        });
        if (res.email) setEmail(res.email);
        if (res.name) setName(res.name);
      } catch (err) {
        if (cancelled) return;
        setInviteState({
          kind: 'invalid',
          detail: (err as Error).message || 'Erro ao validar convite.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      await register(email, name, password, inviteToken);
      toast.success('Conta criada.');
      router.replace('/');
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <PublicSurface>
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-3">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12h4l3-9 4 18 3-9h4" />
                </svg>
              </span>
              <span className="text-sm font-bold tracking-tight text-foreground">TMX HUB</span>
            </Link>
            <h1 className="mt-6 text-2xl font-semibold text-foreground">Criar conta</h1>
          </div>

          {inviteState.kind === 'checking' && (
            <div className="glass-card flex items-center gap-2 p-3 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Validando convite…
            </div>
          )}
          {inviteState.kind === 'valid' && (
            <div className="glass-card flex items-start gap-2 border-border p-3 text-[12px]">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              <div className="space-y-0.5">
                <p className="font-semibold text-primary">Convite válido</p>
                {inviteState.invitedBy && (
                  <p className="text-muted-foreground">Convidado por {inviteState.invitedBy}.</p>
                )}
                {inviteState.expiresAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Expira em {new Date(inviteState.expiresAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          )}
          {inviteState.kind === 'invalid' && (
            <div className="glass-card flex items-start gap-2 border-danger/30 p-3 text-[12px]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <div className="space-y-0.5">
                <p className="font-semibold text-danger">{inviteState.detail}</p>
                <p className="text-muted-foreground">Solicite um novo link a um administrador.</p>
              </div>
            </div>
          )}

          <form onSubmit={(event) => void onSubmit(event)} className="glass-card space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="hud-label">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                placeholder="voce@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="hud-label">
                Nome
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="hud-label">
                Senha (mín. 8)
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || inviteState.kind === 'invalid'}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {submitting ? 'Criando…' : 'Criar conta'}
            </Button>
            <p className="text-center text-[12px] text-muted-foreground">
              Já tem conta?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Entrar
              </Link>
            </p>
            <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {inviteToken
                ? 'Registro habilitado por convite'
                : 'Esta instância requer convite — peça a um administrador.'}
            </p>
          </form>
        </div>
      </main>
    </PublicSurface>
  );
}
