import type { ReactNode } from 'react';

export function TopBar({ children }: { children: ReactNode }) {
  return (
    <header className="flex min-h-12 flex-none items-center gap-1.5 border-b border-line bg-panel px-2 py-1.5 desk:min-h-[52px] desk:gap-2.5 desk:px-3 desk:py-2">
      {children}
    </header>
  );
}
