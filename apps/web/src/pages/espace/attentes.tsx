// Espace candidat : attentes (selon le profil, verrouillé) et autres process.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Page, C, card, h2, btn, input, chip, linkBtn, Loading, ErrorNote, fmtDate, espaceFetch, useAuthGuard } from './espace-ui';
import { OtherProcessesEditor, type OtherProcess } from './other-processes';

interface Expectations {
  profile: 'TECH' | 'SALES'; fields: Array<{ id: string; label: string }>;
  expectations: Record<string, string>; otherProcesses: OtherProcess[]; updatedAt: string; email: string;
}

export default function EspaceExpectationsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['espace', 'expectations'], queryFn: () => espaceFetch<Expectations>('/expectations'), retry: false, staleTime: 0 });
  const me = useQuery({ queryKey: ['espace', 'me'], queryFn: () => espaceFetch<{ name: string; unread: number }>('/me'), retry: false, staleTime: 0 });
  useAuthGuard(q.error || me.error);
  const [exp, setExp] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<OtherProcess[]>([]);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Your expectations | Humanup'; }, []);
  useEffect(() => { if (q.data) { setExp(q.data.expectations || {}); setOthers(q.data.otherProcesses || []); } }, [q.data]);

  async function save() {
    setBusy(true); setError(''); setSaved('');
    try {
      const d = await espaceFetch<Expectations>('/expectations', { method: 'PUT', body: JSON.stringify({ expectations: exp, otherProcesses: others.filter((o) => o.company.trim()) }) });
      qc.setQueryData(['espace', 'expectations'], d);
      qc.invalidateQueries({ queryKey: ['espace', 'me'] });
      setSaved('Saved. Your Humanup team has been notified.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!q.data || !me.data) return <Page><Loading /></Page>;
  const d = q.data;

  return (
    <Page unread={me.data.unread} name={me.data.name}>
      <main style={{ maxWidth: 840, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Link to="/espace" style={{ fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Back to my space</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 style={{ margin: 0, fontSize: 26, color: C.ink, letterSpacing: '-0.02em' }}>Your expectations</h1>
            <span style={{ fontSize: 14, color: C.muted }}>Last updated {fmtDate(d.updatedAt, { month: 'long', day: 'numeric' })}. Your team is notified of every change.</span>
          </div>
          <span style={chip(true)}>{d.profile === 'SALES' ? 'Sales' : 'Tech'} profile</span>
        </div>

        <section style={{ ...card, padding: '8px 24px 16px' }}>
          {d.fields.map((f) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr', gap: 16, padding: '10px 0', borderTop: `1px solid ${C.soft}`, alignItems: 'center' }}>
              <label htmlFor={`x-${f.id}`} style={{ color: C.muted, fontSize: 14 }}>{f.label}</label>
              <input id={`x-${f.id}`} value={exp[f.id] || ''} onChange={(e) => setExp({ ...exp, [f.id]: e.target.value })} style={input} />
            </div>
          ))}
        </section>

        <section style={{ ...card, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ ...h2, fontSize: 17 }}>Your other processes</h2>
            <span style={{ fontSize: 13, color: C.muted }}>Only your Humanup team sees this</span>
          </div>
          <OtherProcessesEditor value={others} onChange={setOthers} />
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && <p role="status" style={{ margin: 0, color: C.ok, fontSize: 14 }}>{saved}</p>}
        <button type="button" onClick={save} disabled={busy} style={{ ...btn, alignSelf: 'flex-start', opacity: busy ? 0.6 : 1 }}>Save my changes</button>

        <section style={{ ...card, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
          <h2 style={{ ...h2, fontSize: 17 }}>Your account</h2>
          <span style={{ color: C.muted }}>You sign in with {d.email}. Your profile type can only be changed by your Humanup team.</span>
          <button type="button" onClick={async () => { await espaceFetch('/public/password-reset', { method: 'POST', body: JSON.stringify({ email: d.email }) }).catch(() => {}); setSaved(`We sent a link to ${d.email} to choose a new password.`); }} style={{ ...linkBtn, alignSelf: 'flex-start', textDecoration: 'none' }}>Get a new password by email</button>
          <a href={`mailto:meroe@humanup.io?subject=${encodeURIComponent('Delete my Humanup space')}&body=${encodeURIComponent(`Please delete my candidate space and my data (${d.email}).`)}`} style={{ fontWeight: 600, color: '#8A1C1C' }}>Ask to delete my space and my data</a>
        </section>
      </main>
    </Page>
  );
}
