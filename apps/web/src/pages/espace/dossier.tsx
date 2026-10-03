// Espace candidat : dossier de préparation d'un process (rubriques repliables,
// suivi « lu » par rubrique, sources et date de vérification).
import { useEffect, useState } from 'react';
import { C, card, h2, chip, fmtDate, espaceFetch } from './espace-ui';

export interface DossierView {
  updatedAt: string | null;
  minutes: number;
  photos: Array<{ url: string; caption: string }>;
  sections: Array<{
    id: string; title: string; body: string; facts: Array<{ label: string; value: string }>;
    sources: string; confirmedBody: string; checkedAt: string | null; checkedBy: string | null; minutes: number; read: boolean;
  }>;
}

/** Texte brut : paragraphes séparés par une ligne vide, lignes « - » en puces. */
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
        const intro = lines.filter((l) => !l.startsWith('- '));
        const items = lines.filter((l) => l.startsWith('- '));
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {intro.length > 0 && <p style={{ margin: 0 }}>{intro.join(' ')}</p>}
            {items.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((l, j) => <li key={j}>{l.slice(2)}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function Dossier({ processId, dossier, candidateName }: { processId: string; dossier: DossierView; candidateName: string }) {
  const [read, setRead] = useState<Set<string>>(() => new Set(dossier.sections.filter((s) => s.read).map((s) => s.id)));
  const [open, setOpen] = useState<Set<string>>(() => new Set(dossier.sections.slice(0, 1).map((s) => s.id)));
  const total = dossier.sections.length;

  function markRead(id: string) {
    if (read.has(id)) return;
    setRead(new Set(read).add(id));
    espaceFetch(`/processes/${processId}/dossier/read`, { method: 'POST', body: JSON.stringify({ sectionId: id }) }).catch(() => { /* le suivi de lecture n'est pas bloquant */ });
  }
  // La première rubrique est ouverte d'office : elle compte comme lue.
  useEffect(() => { if (dossier.sections[0]) markRead(dossier.sections[0].id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else { next.add(id); markRead(id); }
    setOpen(next);
  }

  return (
    <section style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onCopy={(e) => e.preventDefault()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ ...h2, fontSize: 18 }}>Your preparation dossier</h2>
        <span style={{ fontSize: 13, color: C.muted }}>About {dossier.minutes} minute{dossier.minutes > 1 ? 's' : ''}{dossier.updatedAt ? ` · updated ${fmtDate(dossier.updatedAt)}` : ''}</span>
      </div>

      {dossier.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
          {dossier.photos.map((p, i) => (
            <figure key={i} style={{ margin: 0, flex: '1 0 200px', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <img src={p.url} alt={p.caption || 'Company photo'} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 10, background: C.soft }} />
              {p.caption && <figcaption style={{ fontSize: 13, color: C.muted }}>{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={read.size} aria-label="Sections read" style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
          <div style={{ width: `${(read.size / total) * 100}%`, height: '100%', background: C.accent, transition: 'width .2s' }} />
        </div>
        <span style={{ fontSize: 13, color: C.muted }}>{read.size} of {total} sections read</span>
      </div>
      <div style={{ background: C.soft, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.body }}>
        Confidential. Prepared for {candidateName} by Humanup. Please do not share.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {dossier.sections.map((s) => {
          const isOpen = open.has(s.id);
          return (
            <div key={s.id} style={{ borderTop: `1px solid ${C.line}` }}>
              <button onClick={() => toggle(s.id)} aria-expanded={isOpen} style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 0, padding: '12px 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{s.title}</span>
                <span style={read.has(s.id) ? chip(true) : { fontSize: 13, color: C.muted, whiteSpace: 'nowrap' }}>{read.has(s.id) ? 'Read' : `${s.minutes} min`}</span>
              </button>
              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
                  {s.body && <Body text={s.body} />}
                  {s.facts.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                      {s.facts.map((f, i) => (
                        <div key={i} style={{ background: C.soft, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 13, color: C.muted }}>{f.label}</span>
                          <span style={{ fontWeight: 600, color: C.ink }}>{f.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.confirmedBody && (
                    <div style={{ borderLeft: `3px solid ${C.green}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Body text={s.confirmedBody} />
                      <span style={{ fontSize: 13, color: C.muted }}>Shown because your interview is confirmed.</span>
                    </div>
                  )}
                  <span style={{ fontSize: 13, color: C.muted }}>
                    Sources: {s.sources}{s.checkedAt ? ` · checked${s.checkedBy ? ` by ${s.checkedBy}` : ''} on ${fmtDate(s.checkedAt)}` : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
