// Espace candidat : accueil (prochaine étape, process, équipe, attentes).
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Page, C, card, h2, chip, TeamCard, Loading, fmtDate, fmtDateTime, espaceFetch, useAuthGuard, type TeamMember } from './espace-ui';

export interface ProcessView {
  id: string; title: string; company: string | null; confidential: boolean; location: string | null;
  stage: string; stageLabel: string; closed: boolean; closedAt: string | null; hired: boolean;
  next: { kind: string; date: string } | null;
  steps: Array<{ stage: string; label: string; state: 'done' | 'current' | 'todo'; date: string | null }>;
  feedback: Array<{ date: string; step: string; text: string; author?: string | null }>;
}
interface Me {
  firstName: string; name: string; profile: 'TECH' | 'SALES';
  summary: Array<{ label: string; value: string }>; otherProcessesCount: number; team: TeamMember[]; unread: number;
}

function Lock() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}

export function ProcessRow({ p, first }: { p: ProcessView; first: boolean }) {
  const initial = (p.company || p.title).trim()[0]?.toUpperCase() ?? '?';
  const dateLine = p.closed ? `Closed · ${fmtDate(p.closedAt)}` : p.next ? fmtDate(p.next.date, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  return (
    <Link to={`/espace/process/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', textDecoration: 'none', color: C.body, flexWrap: 'wrap', borderTop: first ? 0 : `1px solid ${C.line}` }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, background: p.confidential ? C.soft : p.closed ? C.soft : C.ink, color: p.confidential || p.closed ? C.muted : '#fff' }}>
        {p.confidential ? <Lock /> : initial}
      </span>
      <span style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600, color: p.closed ? C.muted : C.ink }}>{p.title}</span>
        <span style={{ fontSize: 14, color: C.muted }}>{p.company ?? 'Confidential client'}{p.location ? ` · ${p.location}` : ''}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {!p.closed && <span style={chip(['ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE'].includes(p.stage))}>{p.stageLabel}</span>}
        {dateLine && <span style={{ fontSize: 13, color: C.muted, fontWeight: p.closed ? 600 : 400 }}>{dateLine}</span>}
        {p.closed && <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Update and feedback</span>}
      </span>
    </Link>
  );
}

export default function EspaceHomePage() {
  const me = useQuery({ queryKey: ['espace', 'me'], queryFn: () => espaceFetch<Me>('/me'), retry: false });
  const pr = useQuery({ queryKey: ['espace', 'processes'], queryFn: () => espaceFetch<{ processes: ProcessView[]; next: (ProcessView['next'] & { processId: string; title: string; company: string | null }) | null }>('/processes'), retry: false });
  useAuthGuard(me.error || pr.error);
  useEffect(() => { document.title = 'Your space | Humanup'; }, []);

  if (!me.data || !pr.data) return <Page><Loading /></Page>;
  const { processes, next } = pr.data;
  const m = me.data;

  return (
    <Page unread={m.unread} name={m.name}>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 20px 48px' }} className="esp-grid">
        <div className="esp-main">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, color: C.ink, letterSpacing: '-0.02em' }}>Hi {m.firstName}</h1>
            {next
              ? <p style={{ margin: 0, color: C.muted }}>Next: {next.kind.toLowerCase()}{next.company ? ` at ${next.company}` : ''}, {fmtDateTime(next.date)}. <Link to={`/espace/process/${next.processId}`} style={{ fontWeight: 600 }}>See the details</Link></p>
              : <p style={{ margin: 0, color: C.muted }}>Here is where you stand on each role.</p>}
          </div>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 style={h2}>Your processes</h2>
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
              {processes.length === 0
                ? <p style={{ margin: 0, padding: '18px 20px', color: C.muted }}>No active process for now. Your Humanup team will add the roles they put you forward for here.</p>
                : processes.map((p, i) => <ProcessRow key={p.id} p={p} first={i === 0} />)}
            </div>
          </section>
        </div>

        <aside className="esp-side">
          <TeamCard team={m.team} />
          <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <h2 style={h2}>Your expectations</h2>
              <span style={chip(true)}>{m.profile === 'SALES' ? 'Sales' : 'Tech'}</span>
            </div>
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', fontSize: 14 }}>
              {m.summary.map((s) => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: `1px solid ${C.soft}` }}>
                  <dt style={{ color: C.muted }}>{s.label}</dt><dd style={{ margin: 0, fontWeight: 600, color: C.ink, textAlign: 'right' }}>{s.value}</dd>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: `1px solid ${C.soft}` }}>
                <dt style={{ color: C.muted }}>Other processes</dt><dd style={{ margin: 0, fontWeight: 600, color: C.ink }}>{m.otherProcessesCount}</dd>
              </div>
            </dl>
            <Link to="/espace/attentes" style={{ fontSize: 14, fontWeight: 600 }}>View and edit all</Link>
          </section>
        </aside>
      </main>
      <footer style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 32px', fontSize: 13, color: C.muted }}>This space is private to you.</footer>
    </Page>
  );
}
