import type { ReactNode } from 'react'

// Every screen's content goes in here: never wider than 720px, 16px gutter on phones.
export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-content flex-col gap-4 px-2 py-4 sm:px-3">{children}</main>
}
