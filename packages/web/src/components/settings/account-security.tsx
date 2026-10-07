'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { KeyRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

export function AccountSecurity() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState<'change' | 'reset' | null>(null);

  const currentPasswordError =
    passwordValidation === 'change' && !currentPassword ? 'Informe sua senha atual.' : null;
  const newPasswordError =
    passwordValidation && newPassword.length < 8
      ? 'A nova senha precisa ter ao menos 8 caracteres.'
      : null;
  const confirmPasswordError =
    passwordValidation && newPassword !== confirmPassword
      ? 'A confirmação da nova senha não confere.'
      : null;

  function clearForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordValidation(null);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordValidation('change');
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) return;
    setChangingPassword(true);
    try {
      await apiClient.changePassword(currentPassword, newPassword);
      clearForm();
      toast.success('Senha alterada. Use a nova senha no outro navegador.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChangingPassword(false);
    }
  }

  async function adminResetPassword() {
    setPasswordValidation('reset');
    if (newPassword.length < 8 || newPassword !== confirmPassword) return;
    setChangingPassword(true);
    try {
      await apiClient.adminResetOwnPassword(newPassword);
      clearForm();
      toast.success('Senha redefinida. Use a nova senha no outro navegador.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <section className="glass-card space-y-5 p-5 sm:p-6" aria-labelledby="account-security-title">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-cyan-300" aria-hidden />
        <h2 id="account-security-title" className="text-base font-semibold text-white">
          Alterar senha
        </h2>
      </div>
      <p className="max-w-2xl text-[13px] text-white/55">
        A mesma senha funciona em qualquer navegador. Sua sessão atual permanece ativa depois da
        alteração.
      </p>
      <form className="grid gap-4 md:grid-cols-3" noValidate onSubmit={changePassword}>
        <FormField id="current-password" label="Senha atual" error={currentPasswordError}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </FormField>
        <FormField
          id="new-password"
          label="Nova senha"
          error={newPasswordError}
          help="Use pelo menos 8 caracteres."
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </FormField>
        <FormField id="confirm-password" label="Confirmar nova senha" error={confirmPasswordError}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>
        <div className="flex flex-col items-start gap-3 md:col-span-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={changingPassword}>
            {changingPassword ? 'Alterando…' : 'Alterar senha'}
          </Button>
          <Button
            type="button"
            formNoValidate
            variant="outline"
            disabled={changingPassword}
            onClick={() => void adminResetPassword()}
          >
            Definir senha sem a atual
          </Button>
        </div>
        <p className="text-xs text-amber-200/80 md:col-span-3">
          A redefinição sem a senha atual está disponível apenas para o administrador autenticado.
        </p>
      </form>
    </section>
  );
}
