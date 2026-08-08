/** Page de réservation publique (remplace Calendly). URL : /book/:slug */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Clock, Video, Calendar, Check, ArrowLeft, AlertCircle } from 'lucide-react';

interface PublicPage {
  slug: string; title: string; durationMin: number; timezone: string;
  kind?: string;
  mandat?: { id: string; titrePoste: string; entreprise: string | null } | null;
  host: { name: string; avatarUrl: string | null };
  slots: string[];
}
interface Confirmed { slotStart: string; slotEnd: string; meetLink: string | null; hostName: string; message: string }

type Lang = 'fr' | 'en';

// Domaines email personnels/génériques : refusés pour un Discovery call (pro)
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'yahoo.co.uk', 'hotmail.com', 'hotmail.fr',
  'outlook.com', 'outlook.fr', 'live.com', 'live.fr', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.fr', 'orange.fr', 'free.fr', 'sfr.fr',
  'laposte.net', 'wanadoo.fr', 'bbox.fr', 'numericable.fr', 'yopmail.com',
]);

const TXT = {
  fr: {
    lang: 'FR', minutes: 'minutes', meet: 'Google Meet (lien envoyé automatiquement)', tz: 'Fuseau',
    chooseSlot: 'Choisissez un créneau', noSlot: 'Aucun créneau disponible pour l\'instant.',
    changeSlot: 'Changer de créneau', confirm: 'Vos informations', slotN: (n: number) => `${n} créneau${n > 1 ? 'x' : ''}`,
    yourInfo: 'Vos informations', seeSlots: 'Voir les créneaux', backInfo: 'Modifier mes infos',
    name: 'Nom & prénom', poste: 'Votre poste', societe: 'Société', email: 'Email professionnel', emailCand: 'Votre email',
    phone: 'Téléphone', roleHiring: 'Quel poste recrutez-vous ?', timeline: 'Pour quand ?', roleApproached: 'Pour quel poste avez-vous été approché ?',
    message: 'Message (optionnel)', submit: 'Confirmer le rendez-vous', submitting: 'Réservation…',
    emailProErr: 'Merci d\'utiliser votre email professionnel — une adresse gmail/générique ne permet pas de réserver.',
    booked: 'C\'est réservé !', join: 'Rejoindre le Google Meet',
    proTitle: 'À lire avant de réserver',
    proText: `Cette consultation gratuite de 45 minutes vous aide à évaluer et clarifier vos besoins de recrutement. Avant de réserver, quelques conditions :

• Cette consultation est réservée aux décideurs / managers qui recrutent, pas aux candidats. Si vous êtes candidat, contactez-moi par email — les RDV pris par des candidats sont annulés automatiquement.
• Les RDV pris avec une adresse Gmail ou générique (plutôt qu'un domaine d'entreprise) sont annulés automatiquement.
• En cas d'absence sans prévenir, j'annule tous les RDV futurs.

Ce que nous verrons :
1. Définir vos besoins : les compétences et profils nécessaires à votre équipe.
2. Prioriser : cartographier vos objectifs de recrutement, court et long terme.
3. Construire un plan : les étapes concrètes pour optimiser votre process.
4. Solutions sur-mesure : les bons outils et services pour réussir vos recrutements.

Le premier appel est gratuit. Mes honoraires : 22 % du package total du candidat recruté. Si ça vous convient, parlons-en.`,
    candTitle: '15 min en visio — HumanUp.io',
    candText: `Méroë, recruteur chez HumanUp.io. Je vous propose 15 minutes en visio. L'objectif : mieux vous connaître.

• Votre parcours et ce que vous visez vraiment
• Vos attentes sur le prochain poste (contexte, périmètre, package)
• Les opportunités que j'ai en portefeuille et qui peuvent coller

Le lien de visioconférence est dans l'invitation. Si vous ne pouvez pas être présent, prévenez-moi en amont — je décale sans problème. Une absence sans nouvelles, et je ne reprogramme pas.`,
  },
  en: {
    lang: 'EN', minutes: 'minutes', meet: 'Google Meet (link sent automatically)', tz: 'Timezone',
    chooseSlot: 'Pick a time', noSlot: 'No slots available right now.',
    changeSlot: 'Change time', confirm: 'Your details', slotN: (n: number) => `${n} slot${n > 1 ? 's' : ''}`,
    yourInfo: 'Your details', seeSlots: 'See availability', backInfo: 'Edit my details',
    name: 'Full name', poste: 'Your role', societe: 'Company', email: 'Work email', emailCand: 'Your email',
    phone: 'Phone', roleHiring: 'What role are you hiring for?', timeline: 'By when?', roleApproached: 'Which role were you approached for?',
    message: 'Message (optional)', submit: 'Confirm the meeting', submitting: 'Booking…',
    emailProErr: 'Please use your work email — a Gmail or generic address can\'t book this meeting.',
    booked: 'You\'re booked!', join: 'Join the Google Meet',
    proTitle: 'Please read before booking',
    proText: `This is a free 45-minute consultation designed to help you assess and clarify your hiring needs. Before you book, a few conditions:

• This consultation is for hiring managers, not candidates. If you are a candidate, please reach out by email instead — candidate-booked meetings are cancelled automatically.
• Meetings booked with a Gmail or generic email address rather than a company domain are cancelled automatically.
• If you don't show up without letting me know in advance, I'll cancel any future meetings.

What we'll cover:
1. Defining your needs: the skills and profiles required to build your team.
2. Setting priorities: mapping your key hiring goals, short- or long-term.
3. Building a plan: concrete steps to optimize your hiring process.
4. Tailored solutions: the right tools and services to support your hiring success.

The first call is free. My recruitment fee is 22% of the hired candidate's total package. If that works for you, let's talk.`,
    candTitle: '15 min video call — HumanUp.io',
    candText: `Méroë here, recruiter at HumanUp.io. I'd like to book 15 minutes with you on video. The goal is simple: to get to know you.

• Your background and where you actually want to go next
• What you expect from your next role (scope, context, package)
• The opportunities I'm currently working on that could fit

The video link is in the invitation. If you can't make it, let me know beforehand — happy to reschedule. A no-show without notice, though, and I won't rebook.`,
  },
} as const;

function dayKey(iso: string) { return iso.slice(0, 10); }
function fmtDay(iso: string, lang: Lang) { return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }
function fmtTime(iso: string, lang: Lang) { return new Date(iso).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }); }
function initials(name: string) { return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'HU'; }

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [lang, setLang] = useState<Lang>('fr');
  const [step, setStep] = useState<'info' | 'slot'>('info');
  const [selDay, setSelDay] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', email: '', phone: '', poste: '', societe: '', roleHiring: '', timeline: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  const t = TXT[lang];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    document.title = 'Réserver un créneau — HumanUp';
    (async () => {
      try {
        const res = await fetch(`/api/v1/public/booking/${slug}`);
        if (!res.ok) throw new Error('Page introuvable');
        setPage(await res.json() as PublicPage);
      } catch { setErr("Cette page de réservation n'existe pas ou n'est plus active."); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  const days = useMemo(() => {
    if (!page) return [];
    const map = new Map<string, string[]>();
    for (const s of page.slots) { const k = dayKey(s); if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
    return Array.from(map.entries()).map(([k, slots]) => ({ key: k, iso: slots[0], slots }));
  }, [page]);

  useEffect(() => { if (days.length && !selDay) setSelDay(days[0].key); }, [days, selDay]);

  const kind = page?.kind ?? 'GENERIC';
  const isPro = kind === 'DISCOVERY';
  const isCand = kind === 'QUALIFICATION';
  const emailDomain = f.email.split('@')[1]?.toLowerCase().trim();
  const emailIsPersonal = !!emailDomain && PERSONAL_DOMAINS.has(emailDomain);
  const emailProValid = !isPro || (!!emailDomain && !emailIsPersonal);
  const fixedMandat = isCand ? page?.mandat ?? null : null;

  const infoValid = !!f.name.trim() && !!f.email.trim() && emailProValid
    && (!isPro || (!!f.poste.trim() && !!f.societe.trim() && !!f.roleHiring.trim() && !!f.timeline.trim()));

  const submit = async (slot: string) => {
    if (!slot || !infoValid || busy) return;
    setBusy(true); setErr('');
    try {
      const roleHiring = fixedMandat ? fixedMandat.titrePoste : f.roleHiring.trim() || undefined;
      const res = await fetch(`/api/v1/public/booking/${slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name.trim(), email: f.email.trim(), slotStart: slot,
          phone: f.phone.trim() || undefined,
          poste: f.poste.trim() || undefined,
          societe: f.societe.trim() || undefined,
          roleHiring,
          timeline: f.timeline.trim() || undefined,
          note: f.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Réservation impossible');
      setConfirmed(data as Confirmed);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const S = { fontFamily: "'Manrope',sans-serif" };
  if (loading) return <div style={{ ...S, minHeight: '100vh', background: '#F4F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A96AE' }}>Chargement…</div>;
  if (err && !page) return <div style={{ ...S, minHeight: '100vh', background: '#F4F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#B3261E' }}><AlertCircle size={26} />{err}</div>;
  if (!page) return null;

  const daySlots = days.find(d => d.key === selDay)?.slots ?? [];

  return (
    <div style={{ ...S, minHeight: '100vh', background: '#F4F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{`.bk-slot:hover{ border-color:#22177A !important; } .bk-day:hover{ background:#F2F3D8 !important; }`}</style>
      <div style={{ width: 960, maxWidth: '100%', background: '#fff', borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 90px -40px rgba(34,23,122,.45)', display: 'grid', gridTemplateColumns: confirmed ? '1fr' : '300px 1fr', minHeight: 520 }}>
        {/* LEFT — host */}
        {!confirmed && (
          <div style={{ background: '#22177A', color: '#fff', padding: '30px 28px', position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '38px 38px' }} />
            <div style={{ position: 'relative' }}>
              <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 17, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30 }}>
                <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#E6E9AF', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>{page.host.avatarUrl ? <img src={page.host.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(page.host.name)}</span>
                <div><div style={{ fontSize: 12.5, color: 'rgba(230,233,175,.7)' }}>{page.host.name}</div><div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, marginTop: 2 }}>{page.title}</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26, fontSize: 13.5, color: 'rgba(230,233,175,.9)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Clock size={15} color="#E6E9AF" />{page.durationMin} {t.minutes}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Video size={15} color="#E6E9AF" />{t.meet}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Calendar size={15} color="#E6E9AF" />{t.tz} {page.timezone}</span>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT — content */}
        <div style={{ padding: '26px 32px 34px', position: 'relative' }}>
          {/* Toggle langue */}
          {!confirmed && (
            <div style={{ position: 'absolute', top: 20, right: 24, display: 'flex', gap: 2, background: '#F2F3D8', borderRadius: 999, padding: 3 }}>
              {(['fr', 'en'] as Lang[]).map(l => (
                <button key={l} onClick={() => setLang(l)} style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', background: lang === l ? '#22177A' : 'transparent', color: lang === l ? '#E6E9AF' : '#22177A' }}>{TXT[l].lang}</button>
              ))}
            </div>
          )}

          {confirmed ? (
            <div style={{ textAlign: 'center', maxWidth: 460, margin: '0 auto', paddingTop: 20 }}>
              <span style={{ display: 'inline-flex', width: 66, height: 66, borderRadius: '50%', background: '#EAF3EC', alignItems: 'center', justifyContent: 'center' }}><Check size={30} color="#2C6B3F" strokeWidth={2.6} /></span>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, color: '#1A1533', marginTop: 18 }}>{t.booked}</div>
              <div style={{ fontSize: 15, color: '#4A4568', marginTop: 10, textTransform: 'capitalize' }}>{fmtDay(confirmed.slotStart, lang)} · {fmtTime(confirmed.slotStart, lang)} — {confirmed.hostName}</div>
              <p style={{ fontSize: 13.5, color: '#6E6A85', lineHeight: 1.6, marginTop: 12 }}>{confirmed.message}</p>
              {confirmed.meetLink && <a href={confirmed.meetLink} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 13.5, fontWeight: 700, color: '#E6E9AF', background: '#22177A', borderRadius: 12, padding: '12px 20px', textDecoration: 'none' }}><Video size={15} />{t.join}</a>}
            </div>
          ) : step === 'slot' ? (
            <>
              <button onClick={() => { setStep('info'); setErr(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#4A4568', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}><ArrowLeft size={14} />{t.backInfo}</button>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, color: '#1A1533' }}>{t.chooseSlot}</div>
              {busy && <div style={{ fontSize: 12.5, color: '#22177A', fontWeight: 700, marginTop: 8 }}>{t.submitting}</div>}
              {err && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#B3261E', fontWeight: 600, marginTop: 8 }}><AlertCircle size={14} />{err}</div>}
              {days.length === 0 ? (
                <div style={{ marginTop: 20, padding: '30px 16px', textAlign: 'center', color: '#8A8699', fontSize: 14, border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 14 }}>{t.noSlot}</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 18, marginTop: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                    {days.map(d => (
                      <button key={d.key} className="bk-day" onClick={() => setSelDay(d.key)} style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 11, border: `1px solid ${selDay === d.key ? '#22177A' : 'rgba(34,23,122,.12)'}`, background: selDay === d.key ? '#F2F3D8' : '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: selDay === d.key ? 800 : 600, color: '#1A1533', textTransform: 'capitalize' }}>{fmtDay(d.iso, lang)}<span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#8A8699', marginTop: 2 }}>{t.slotN(d.slots.length)}</span></button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 8, alignContent: 'start', maxHeight: 380, overflowY: 'auto' }}>
                    {daySlots.map(s => (
                      <button key={s} className="bk-slot" disabled={busy} onClick={() => submit(s)} style={{ padding: '11px 8px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.16)', background: '#fff', cursor: busy ? 'wait' : 'pointer', fontSize: 13.5, fontWeight: 700, color: '#22177A', transition: 'border-color .15s', opacity: busy ? 0.5 : 1 }}>{fmtTime(s, lang)}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Bloc conditions (pro) ou intro (candidat) */}
              {(isPro || isCand) && (
                <div style={{ marginTop: 6, background: isPro ? '#FBF3E7' : '#F2F3D8', border: `1px solid ${isPro ? '#F0D9B5' : 'rgba(34,23,122,.14)'}`, borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: isPro ? '#8A6A2E' : '#22177A', marginBottom: 6 }}>{isPro ? t.proTitle : t.candTitle}</div>
                  <div style={{ fontSize: 12.5, color: '#4A4568', lineHeight: 1.55, whiteSpace: 'pre-line', maxHeight: 210, overflowY: 'auto' }}>{isPro ? t.proText : t.candText}</div>
                </div>
              )}

              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 18, color: '#1A1533', marginTop: 16 }}>{t.yourInfo}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, maxWidth: 460 }}>
                <div><label style={lbl}>{t.name}</label><input value={f.name} onChange={set('name')} style={inp} placeholder={lang === 'fr' ? 'Jean Dupont' : 'John Doe'} /></div>

                {isPro && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>{t.poste}</label><input value={f.poste} onChange={set('poste')} style={inp} placeholder={lang === 'fr' ? 'Directeur des opérations' : 'Head of Ops'} /></div>
                    <div><label style={lbl}>{t.societe}</label><input value={f.societe} onChange={set('societe')} style={inp} placeholder="Acme Inc." /></div>
                  </div>
                )}

                <div>
                  <label style={lbl}>{isPro ? t.email : t.emailCand}</label>
                  <input type="email" value={f.email} onChange={set('email')} style={{ ...inp, borderColor: isPro && f.email && !emailProValid ? '#B3261E' : 'rgba(34,23,122,.14)' }} placeholder={isPro ? 'vous@entreprise.com' : (lang === 'fr' ? 'vous@email.com' : 'you@email.com')} />
                  {isPro && f.email && !emailProValid && <div style={{ fontSize: 11.5, color: '#B3261E', marginTop: 5, fontWeight: 600 }}>{t.emailProErr}</div>}
                </div>

                <div><label style={lbl}>{t.phone}</label><input value={f.phone} onChange={set('phone')} style={inp} placeholder="+33 6 12 34 56 78" /></div>

                {isPro && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>{t.roleHiring}</label><input value={f.roleHiring} onChange={set('roleHiring')} style={inp} placeholder={lang === 'fr' ? 'Ex : Sales Manager' : 'e.g. Sales Manager'} /></div>
                    <div><label style={lbl}>{t.timeline}</label><input value={f.timeline} onChange={set('timeline')} style={inp} placeholder={lang === 'fr' ? 'Ex : sous 2 mois' : 'e.g. within 2 months'} /></div>
                  </div>
                )}

                {isCand && (
                  <div>
                    <label style={lbl}>{t.roleApproached}</label>
                    {fixedMandat
                      ? <div style={{ ...inp, display: 'flex', alignItems: 'center', color: '#22177A', fontWeight: 700, background: '#F2F3D8' }}>{fixedMandat.titrePoste}{fixedMandat.entreprise ? ` · ${fixedMandat.entreprise}` : ''}</div>
                      : <input value={f.roleHiring} onChange={set('roleHiring')} style={inp} placeholder={lang === 'fr' ? 'Le poste pour lequel on vous a contacté' : 'The role you were contacted for'} />}
                  </div>
                )}

                {!isPro && <div><label style={lbl}>{t.message}</label><textarea value={f.note} onChange={set('note')} style={{ ...inp, minHeight: 64, resize: 'vertical', fontFamily: "'Manrope',sans-serif" }} placeholder={lang === 'fr' ? 'Un mot pour le recruteur…' : 'A word for the recruiter…'} /></div>}

                {err && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#B3261E', fontWeight: 600 }}><AlertCircle size={14} />{err}</div>}
                <button disabled={!infoValid} onClick={() => { setErr(''); setStep('slot'); }} style={{ fontSize: 14.5, fontWeight: 800, background: infoValid ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 14, cursor: infoValid ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{t.seeSlots}<ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }} /></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533', outline: 'none', boxSizing: 'border-box' };
