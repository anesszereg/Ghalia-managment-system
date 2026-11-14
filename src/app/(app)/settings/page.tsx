import { getSettings } from "@/lib/utils";
import { saveSettingsAction } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  return <div className="max-w-2xl space-y-6">
    <h1 className="text-2xl font-bold">Settings</h1>
    {sp.saved && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Settings saved.</p>}
    <form action={saveSettingsAction} className="card space-y-5 p-6">
      <h2 className="font-semibold text-blue-900">Your showroom</h2>
      <label className="block"><span className="label">Showroom name</span><input name="showroomName" required defaultValue={settings.showroomName} className="input" /></label>
      <label className="block"><span className="label">Currency</span><input name="currency" required defaultValue={settings.currency} className="input" /></label>
      <SubmitButton>Save settings</SubmitButton>
    </form>
    <div className="card p-6"><h2 className="font-semibold text-emerald-900">Keep your data safe</h2><p className="mt-2 mb-4 text-sm text-slate-500">Download a backup of your business records.</p><a href="/api/backup" className="btn-ghost">Download backup</a></div>
  </div>;
}
