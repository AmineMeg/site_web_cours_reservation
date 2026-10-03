export function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p
      role={ok ? "status" : "alert"}
      className={`rounded-xl border-2 px-4 py-3 text-lg font-medium ${
        ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"
      }`}
    >
      {ok ? "✅ " : "⚠️ "}
      {children}
    </p>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">{title}</h1>
      {intro && <p className="mt-2 text-lg text-stone-600">{intro}</p>}
    </header>
  );
}
