import type { ReactNode } from "react";

export default function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-muted">{children}</p>
    </section>
  );
}
