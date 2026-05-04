'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/';
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Login efetuado.');
      router.replace(next);
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
            Terminal de Controle
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="hud-label">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="voce@exemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="hud-label">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
          <p className="text-center text-[12px] text-white/40">
            Não tem conta?{' '}
            <Link href="/register" className="text-cyan-300 hover:underline">
              Solicitar acesso
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
