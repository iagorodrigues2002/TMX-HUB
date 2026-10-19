import { toast } from 'sonner';

export async function copyText(value: string, successMessage: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
    return true;
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
    return false;
  }
}
