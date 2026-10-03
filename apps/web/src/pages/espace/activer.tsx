// Espace candidat : activation depuis l'invitation. Le candidat valide ce que
// l'équipe a noté pendant le call (modifiable), ses autres process, accepte la
// politique de confidentialité et choisit son mot de passe.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Page, C, card, btn, input, label, linkBtn, chip, LOGO, Avatar, ErrorNote, Loading, espaceFetch, espaceStore, type TeamMember } from './espace-ui';
import { OtherProcessesEditor, type OtherProcess } from './other-processes';

interface Ctx {
  firstName: string; name: string; email: string; profile: 'TECH' | 'SALES';
  fields: Array<{ id: string; label: string }>;
  expectations: Record<string, string>; otherProcesses: OtherProcess[]; team: TeamMember[];
}

export default function EspaceActivatePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadError, setLoadError] = useState('');
  const [exp, setExp] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [others, setOthers] = useState<OtherProcess[]>([]);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Activate your space | Humanup'; }, []);
  useEffect(() => {
    espaceFetch<Ctx>(`/public/activation?token=${encodeURIComponent(token)}`)
      .then((d) => { setCtx(d); setExp(d.expectations || {}); setOthers(d.otherProcesses || []); })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 10) return setError('Your password needs at least 10 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    if (!consent) return setError('Please accept the privacy policy.');
    setError('');
    setBusy(true);
    try {
      const r = await espaceFetch<{ token: string }>('/public/activate', {
        method: 'POST',
        body: JSON.stringify({ token, password: pw, consent, expectations: exp, otherProcesses: others.filter((o) => o.company.trim()) }),
      });
      espaceStore.set(r.token);
      navigate('/espace', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Page header={false}>
        <div style={{ maxWidth: 520, margin: '80px auto', padding: '0 20px' }}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: C.ink }}>This link does not work anymore</h1>
            <p style={{ margin: 0 }}>{loadError}</p>
            <a href="/espace/login" style={{ fontWeight: 600 }}>Go to sign in</a>
          </div>
        </div>
      </Page>
    );
  }
  if (!ctx) return <Page header={false}><Loading /></Page>;

  const lead = ctx.team[0];
  const filled = ctx.fields.filter((f) => exp[f.id]);
  const empty = ctx.fields.filter((f) => !exp[f.id]);

  return (
    <Page header={false}>
      <form onSubmit={submit} style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO} alt="Humanup logo" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <span style={{ fontWeight: 700, color: C.ink, fontSize: 16 }}>Humanup</span>
          <span style={{ color: C.muted, fontSize: 14 }}>Candidate space</span>
        </div>

        <section style={{ background: C.accent, color: '#fff', borderRadius: 14, padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {lead && <Avatar name={lead.name} url={lead.avatarUrl} size={56} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 23, lineHeight: 1.25 }}>Welcome {ctx.firstName}, your space is ready</h1>
            <p style={{ margin: 0, color: '#E4E2F3' }}>Here is what we noted during our call. Check that everything is right, change anything that is not, then choose a password.</p>
            {ctx.team.length > 0 && <span style={{ fontSize: 13, color: C.green }}>{ctx.team.map((t) => t.firstName).join(' and ')}, your Humanup team</span>}
          </div>
        </section>

        <section style={{ ...card, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: C.ink }}>What we noted during our call</h2>
            <span style={chip(true)}>{ctx.profile === 'SALES' ? 'Sales' : 'Tech'} profile</span>
          </div>
          {[...filled, ...empty].map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderTop: '1px solid #F3F4F6', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                <label htmlFor={`a-${f.id}`} style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{f.label}</label>
                {editing === f.id
                  ? <input id={`a-${f.id}`} autoFocus value={exp[f.id] || ''} onChange={(e) => setExp({ ...exp, [f.id]: e.target.value })} onBlur={() => setEditing(null)} style={input} />
                  : <span style={{ color: exp[f.id] ? C.ink : C.muted }}>{exp[f.id] || 'Not discussed yet'}</span>}
              </div>
              {editing !== f.id && <button type="button" onClick={() => setEditing(f.id)} style={{ ...linkBtn, textDecoration: 'none', fontSize: 14, flex: 'none' }}>{exp[f.id] ? 'Edit' : 'Add'}</button>}
            </div>
          ))}
        </section>

        <section style={{ ...card, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: C.ink }}>Your other processes</h2>
          <p style={{ margin: 0, fontSize: 14, color: C.muted }}>So we can move at the right pace. Only your Humanup team sees this.</p>
          <OtherProcessesEditor value={others} onChange={setOthers} />
        </section>

        <section style={{ ...card, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: C.ink }}>Choose your password</h2>
          <span style={{ fontSize: 14, color: C.muted }}>You will sign in with {ctx.email}.</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="a-pw" style={label}>Password</label>
              <input id="a-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} style={input} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="a-pw2" style={label}>Confirm password</label>
              <input id="a-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={input} />
            </div>
          </div>
          <span style={{ fontSize: 13, color: C.muted }}>At least 10 characters. Forgot it later? Get a new one by email from the sign-in page.</span>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4, accentColor: C.accent }} />
            <span>I agree that Humanup keeps my data to help me find a role. I can ask to delete my space and my data at any time. Without activity for 24 months, my data is deleted.</span>
          </label>
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" disabled={busy} style={{ ...btn, fontSize: 15, padding: '14px 18px', opacity: busy ? 0.6 : 1 }}>Looks right, open my space</button>
      </form>
    </Page>
  );
}
