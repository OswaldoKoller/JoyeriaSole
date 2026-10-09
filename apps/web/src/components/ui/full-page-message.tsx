import type { ReactNode } from 'react';

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4 text-sm text-stone-500">
      {children}
    </div>
  );
}
