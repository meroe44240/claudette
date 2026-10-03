// Espace candidat : fil des mises à jour (les ouvrir les marque comme lues).
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Page, C, Loading, fmtDate, espaceFetch, useAuthGuard } from './espace-ui';

interface Item { id: string; title: string; text: string; date: string; processId: string; unread: boolean }

export default function EspaceNotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['espace', 'notifications'], queryFn: () => espaceFetch<{ items: Item[] }>('/notifications'), retry: false, staleTime: 0 });
  const me = useQuery({ queryKey: ['espace', 'me'], queryFn: () => espaceFetch<{ name: string }>('/me'), retry: false, staleTime: 0 });
  useAuthGuard(q.error || me.error);
  useEffect(() => { document.title = 'Updates | Humanup'; }, []);
  // Ouvrir le fil marque tout comme lu côté serveur : la pastille de l'en-tête doit suivre.
  useEffect(() => { if (q.dataUpdatedAt) qc.invalidateQueries({ queryKey: ['espace', 'me'] }); }, [q.dataUpdatedAt, qc]);
  if (!q.data) return <Page><Loading /></Page>;

  return (
    <Page name={me.data?.name}>
      <main style={{ maxWidth: 840, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Link to="/espace" style={{ fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Back to my space</Link>
        <h1 style={{ margin: 0, fontSize: 26, color: C.ink, letterSpacing: '-0.02em' }}>Updates</h1>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          {q.data.items.length === 0 && <p style={{ margin: 0, padding: '18px 20px', color: C.muted }}>No update yet.</p>}
          {q.data.items.map((n, i) => (
            <Link key={n.id} to={`/espace/process/${n.processId}`} style={{ display: 'flex', gap: 14, padding: '16px 20px', borderTop: i ? `1px solid ${C.soft}` : 0, textDecoration: 'none', color: C.body, alignItems: 'flex-start' }}>
              <span style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', marginTop: 8, background: n.unread ? C.accent : C.line }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{n.title}</span>
                {n.text && <span style={{ fontSize: 14 }}>{n.text}</span>}
                <span style={{ fontSize: 13, color: C.muted }}>{fmtDate(n.date, { month: 'long', day: 'numeric' })}</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </Page>
  );
}
