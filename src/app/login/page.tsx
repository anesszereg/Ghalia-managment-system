import { loginAction } from "@/lib/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950">
      <div className="w-full max-w-sm card p-8">
        <h1 className="text-2xl font-bold text-navy-950 mb-1">Showroom Manager</h1>
        <p className="text-sm text-slate-500 mb-6">Sign in to your account</p>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200">
            Invalid email or password.
          </div>
        )}
        <form action={loginAction} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" autoComplete="username" />
          </div>
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" required className="input" placeholder="••••••••" />
          </div>
          <button className="btn-primary w-full justify-center">Sign in</button>
        </form>
      </div>
    </div>
  );
}
