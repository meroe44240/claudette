// Espace candidat : page d'un process (étapes, prochain entretien, feedback).
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Page, C, card, h2, btn, TeamCard, Loading, fmtDate, fmtDateTime, espaceFetch, useAuthGuard, type TeamMember } from './espace-ui';
import type { ProcessView } from './index';

export default function EspaceProcessPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['espace', 'process', id], queryFn: () => espaceFetch<ProcessView & { interviewer: string | null }>(`/processes/${id}`), retry: false });
  const me = useQuery({ queryKey: ['espace', 'me'], queryFn: () => espaceFetch<{ name: string; team: TeamMember[]; unread: number }>('/me'), retry: false });
  useAuthGuard(q.error || me.error);
  useEffect(() => { if (q.data) document.title = `${q.data.title} | Humanup`; }, [q.data]);

  if (q.error && (q.error as any).status === 404) {
    return <Page><main style={{ maxWidth: 840, margin: '0 auto', padding: '40px 20px' }}><p>This process is not available. <Link to="/espace">Back to my space</Link></p></main></Page>;
  }
  if (!q.data || !me.data) return <Page><Loading /></Page>;
  const p = q.data;

  return (
    <Page unread={me.data.unread} name={me.data.name}>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Link to="/espace" style={{ fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Back to my space</Link>

        <section style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, color: C.ink, letterSpacing: '-0.02em' }}>{p.title}</h1>
            <span style={{ color: C.muted, fontSize: 14 }}>{p.company ?? 'Confidential client'}{p.location ? ` · ${p.location}` : ''}</span>
            {p.confidential && <span style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>The company name unlocks once your profile is presented.</span>}
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(110px, 1fr))`, gap: 8 }}>
            {p.steps.map((s) => (
              <li key={s.stage} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ height: 6, borderRadius: 3, background: s.state === 'todo' ? C.line : C.accent, opacity: s.state === 'current' ? 0.85 : 1 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: s.state === 'current' ? C.accent : s.state === 'done' ? C.ink : C.muted }}>{s.label}</span>
                <span style={{ fontSize: 13, color: s.state === 'current' ? C.accent : C.muted }}>
                  {s.state === 'done' && s.date ? `Done, ${fmtDate(s.date)}` : s.state === 'current' ? (p.next && s.stage === p.stage ? `Upcoming, ${fmtDate(p.next.date)}` : 'In progress') : ''}
                </span>
              </li>
            ))}
          </ol>
          {p.closed && <div style={{ background: C.soft, borderRadius: 10, padding: '12px 14px', fontSize: 14 }}><b style={{ color: C.ink }}>This process is closed</b> since {fmtDate(p.closedAt, { month: 'long', day: 'numeric' })}. The update and the feedback are below.</div>}
        </section>

        <div className="esp-grid">
          <div className="esp-main">
            <section style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ ...h2, fontSize: 18 }}>Feedback at each step</h2>
              {p.feedback.length === 0 && <p style={{ margin: 0, color: C.muted }}>No feedback yet. Your Humanup team will share it here after each step.</p>}
              {p.feedback.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: C.accent, marginTop: 7 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, color: C.muted }}>{f.step} · {fmtDate(f.date, { month: 'long', day: 'numeric' })}{f.author ? ` · ${f.author}` : ''}</span>
                    <span style={{ whiteSpace: 'pre-line' }}>{f.text}</span>
                  </div>
                </div>
              ))}
            </section>
          </div>
          <aside className="esp-side">
            {p.next && (
              <div style={{ background: C.accent, color: '#fff', borderRadius: 14, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Your next interview</span>
                <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{fmtDateTime(p.next.date)}</span>
                <span style={{ fontSize: 14, color: '#E4E2F3' }}>Your time.{p.interviewer ? ` With ${p.interviewer}.` : ''}</span>
              </div>
            )}
            <TeamCard team={me.data.team} />
            <a href={`mailto:${me.data.team.map((t) => t.email).join(',')}?subject=${encodeURIComponent(`Question about ${p.title}`)}`} style={{ ...btn, background: C.card, color: C.accent, border: `1px solid ${C.accent}` }}>Ask a question about this role</a>
          </aside>
        </div>
      </main>
    </Page>
  );
}
