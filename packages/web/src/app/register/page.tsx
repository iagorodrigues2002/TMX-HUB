'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') || undefined;
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inviteState, setInviteState] = useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'valid'; email?: string; name?: string; expiresAt?: string; invitedBy?: string }
    | { kind: 'invalid'; detail: string }
  >(inviteToken ? { kind: 'checking' } : { kind: 'idle' });

  // Valida o convite quando há token na URL.
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
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
    <main className="flex min-h-screen items-center justify-center bg-[#04101A] p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-md border border-cyan-300/30 shadow-glow"
              style={{
                background:
                  'linear-gradient(135deg, rgba(20,184,166,0.25), rgba(34,211,238,0.05))',
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-cyan-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l3-9 4 18 3-9h4" />
              </svg>
            </span>
            <span className="text-[22px] font-bold tracking-tight text-white">
              TMX{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)' }}>
                HUB
              </span>
            </span>
          </Link>
          <p className="mt-4 text-[12px] uppercase tracking-[0.18em] text-white/45">
            Criar conta
          </p>
        </div>

        {inviteState.kind === 'checking' && (
          <div className="glass-card flex items-center gap-2 p-3 text-[12px] text-white/65">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
            Validando convite…
          </div>
        )}
        {inviteState.kind === 'valid' && (
          <div className="glass-card flex items-start gap-2 border-cyan-300/30 p-3 text-[12px]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <div className="space-y-0.5">
              <p className="font-semibold text-cyan-200">Convite válido</p>
              {inviteState.invitedBy && (
                <p className="text-white/65">Convidado por {inviteState.invitedBy}.</p>
              )}
              {inviteState.expiresAt && (
                <p className="text-[10px] text-white/40">
                  Expira em {new Date(inviteState.expiresAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        )}
        {inviteState.kind === 'invalid' && (
          <div className="glass-card flex items-start gap-2 border-rose-300/30 p-3 text-[12px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            <div className="space-y-0.5">
              <p className="font-semibold text-rose-200">{inviteState.detail}</p>
              <p className="text-white/55">
                Solicite um novo link a um administrador.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="hud-label">Email</Label>
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
            <Label htmlFor="name" className="hud-label">Nome</Label>
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
            <Label htmlFor="password" className="hud-label">Senha (mín. 8)</Label>
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
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {submitting ? 'Criando…' : 'Criar conta'}
          </Button>
          <p className="text-center text-[12px] text-white/40">
            Já tem conta?{' '}
            <Link href="/login" className="text-cyan-300 hover:underline">
              Entrar
            </Link>
          </p>
          <p className="text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
            {inviteToken
              ? 'Registro habilitado por convite'
              : 'Esta instância requer convite — peça a um administrador.'}
          </p>
        </form>
      </div>
    </main>
  );
}
