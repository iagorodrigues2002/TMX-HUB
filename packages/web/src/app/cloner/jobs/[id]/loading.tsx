import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center text-cyan-300/70">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
