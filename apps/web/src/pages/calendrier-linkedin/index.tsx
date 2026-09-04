/**
 * Calendrier éditorial LinkedIn.
 * Les recruteurs déposent leurs posts sur un calendrier mensuel ; statut évolutif
 * (Idée → À valider → Validé → Publié) + fil de discussion. Toute l'équipe voit tout.
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, ImagePlus, Send, Linkedin, Loader2,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';

// ── Types ──────────────────────────────────────────
interface Auteur { id: string; prenom: string | null; nom: string; avatarUrl: string | null; avatarData: string | null }
interface Comment { id: string; texte: string; createdAt: string; auteur: Auteur }
interface Post {
  id: string; datePost: string; texte: string; imageUrl: string | null;
  statut: string; auteurId: string; createdAt: string; auteur: Auteur; commentaires: Comment[];
}

// ── Statuts ────────────────────────────────────────
const STATUTS = [
  { key: 'IDEE', label: 'Idée', dot: '#9A96AE', bg: '#F1F0F5', text: '#6E6A85' },
  { key: 'A_VALIDER', label: 'À valider', dot: '#E5A93B', bg: '#FDF4E3', text: '#9A6B12' },
  { key: 'VALIDE', label: 'Validé', dot: '#22177A', bg: '#ECEAF8', text: '#22177A' },
  { key: 'PUBLIE', label: 'Publié', dot: '#2E9E6B', bg: '#E7F6EE', text: '#1F7A50' },
] as const;
const statutMeta = (k: string) => STATUTS.find((s) => s.key === k) ?? STATUTS[0];

// ── Helpers date ───────────────────────────────────
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

function buildWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // lundi = 0
  const start = new Date(year, month, 1 - startOffset);
  const weeks: Date[][] = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
  }
  return weeks;
}

function initials(a: Auteur) { return `${a.prenom?.[0] || ''}${a.nom?.[0] || ''}`.toUpperCase(); }

function Avatar({ a, size = 28 }: { a: Auteur; size?: number }) {
  const src = a.avatarData || a.avatarUrl;
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#ECEAF8', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700 }}>
      {initials(a)}
    </div>
  );
}

// ── Upload image (multipart, hors api-client JSON) ──
async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem('accessToken');
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/v1/posts-linkedin/upload-image', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) throw new Error("Échec de l'upload");
  return (await res.json()).url as string;
}

// ═══════════════════════════════════════════════════
export default function CalendrierLinkedinPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);

  useEffect(() => { document.title = 'Calendrier LinkedIn — HumanUp'; }, []);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['posts-linkedin'],
    queryFn: () => api.get<Post[]>('/posts-linkedin'),
  });

  const weeks = useMemo(() => buildWeeks(cursor.y, cursor.m), [cursor]);
  const postsByDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      const key = ymd(new Date(p.datePost));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [posts]);

  const openPost = openId ? posts.find((p) => p.id === openId) ?? null : null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['posts-linkedin'] });

  const createMut = useMutation({
    mutationFn: (date: string) => api.post<Post>('/posts-linkedin', { datePost: date, statut: 'IDEE', texte: '' }),
    onSuccess: (p) => { invalidate(); setOpenId(p.id); setCreatingDate(null); },
  });

  function goMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  // Compteurs du mois affiché
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = { IDEE: 0, A_VALIDER: 0, VALIDE: 0, PUBLIE: 0 };
    for (const p of posts) {
      const d = new Date(p.datePost);
      if (d.getFullYear() === cursor.y && d.getMonth() === cursor.m) counts[p.statut] = (counts[p.statut] ?? 0) + 1;
    }
    return counts;
  }, [posts, cursor]);

  return (
    <div className="p-4 md:p-6 lg:p-8" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Linkedin size={22} color="#E6E9AF" />
          </div>
          <div>
            <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, color: '#1A1533', margin: 0, letterSpacing: '-0.02em' }}>Calendrier LinkedIn</h1>
            <p style={{ fontSize: 13, color: '#8A8699', margin: 0 }}>Le planning éditorial de l'équipe — proposez, validez, publiez.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} className="grid place-items-center rounded-lg border h-9 w-9" style={{ borderColor: 'rgba(34,23,122,.14)' }}><ChevronLeft size={18} /></button>
          <div style={{ minWidth: 150, textAlign: 'center', fontWeight: 700, fontSize: 15.5, color: '#1A1533' }}>{MOIS[cursor.m]} {cursor.y}</div>
          <button onClick={() => goMonth(1)} className="grid place-items-center rounded-lg border h-9 w-9" style={{ borderColor: 'rgba(34,23,122,.14)' }}><ChevronRight size={18} /></button>
          <button onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })} className="rounded-lg border px-3 h-9 text-[13px] font-semibold" style={{ borderColor: 'rgba(34,23,122,.14)', color: '#22177A' }}>Aujourd'hui</button>
        </div>
      </div>

      {/* Légende + compteurs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: s.bg, color: s.text }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot }} />
            {s.label}
            <span style={{ opacity: 0.6 }}>· {monthCounts[s.key] ?? 0}</span>
          </span>
        ))}
      </div>

      {/* Grille */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(34,23,122,.1)', background: '#fff' }}>
        <div className="grid grid-cols-7" style={{ borderBottom: '1px solid rgba(34,23,122,.08)' }}>
          {JOURS.map((j) => (
            <div key={j} className="px-2 py-2.5 text-center text-[11.5px] font-bold uppercase" style={{ color: '#9A96AE', letterSpacing: '.08em' }}>{j}</div>
          ))}
        </div>
        {isLoading ? (
          <div className="py-20 grid place-items-center text-[#8A8699]"><Loader2 className="animate-spin" /></div>
        ) : (
          weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7" style={{ borderTop: wi ? '1px solid rgba(34,23,122,.06)' : 'none' }}>
              {week.map((day) => {
                const inMonth = day.getMonth() === cursor.m;
                const isToday = sameDay(day, today);
                const dayPosts = postsByDay.get(ymd(day)) ?? [];
                return (
                  <div
                    key={ymd(day)}
                    className="group relative min-h-[112px] p-1.5"
                    style={{ borderLeft: '1px solid rgba(34,23,122,.05)', background: inMonth ? '#fff' : '#FBFBF7' }}
                  >
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span
                        className="grid place-items-center text-[12px] font-bold"
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          color: isToday ? '#fff' : inMonth ? '#4A4568' : '#C4C1D0',
                          background: isToday ? '#22177A' : 'transparent',
                        }}
                      >{day.getDate()}</span>
                      <button
                        onClick={() => createMut.mutate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0).toISOString())}
                        className="opacity-0 group-hover:opacity-100 transition grid place-items-center rounded-md"
                        style={{ width: 20, height: 20, color: '#22177A', background: '#ECEAF8' }}
                        title="Ajouter un post"
                      ><Plus size={14} /></button>
                    </div>
                    <div className="flex flex-col gap-1">
                      {dayPosts.map((p) => {
                        const m = statutMeta(p.statut);
                        return (
                          <button
                            key={p.id}
                            onClick={() => setOpenId(p.id)}
                            className="w-full text-left rounded-md px-1.5 py-1 flex items-center gap-1.5 hover:brightness-95 transition"
                            style={{ background: m.bg }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                            <Avatar a={p.auteur} size={16} />
                            <span className="truncate text-[11.5px] font-medium" style={{ color: m.text }}>
                              {p.texte?.trim() ? p.texte.trim().split('\n')[0] : 'Post sans texte'}
                            </span>
                            {p.commentaires.length > 0 && (
                              <span className="ml-auto text-[10px] font-bold" style={{ color: m.text, opacity: 0.7 }}>💬{p.commentaires.length}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {openPost && (
          <PostDrawer
            key={openPost.id}
            post={openPost}
            currentUserId={user?.id ?? ''}
            isAdmin={user?.role === 'ADMIN'}
            onClose={() => setOpenId(null)}
            onChanged={invalidate}
            onDeleted={() => { setOpenId(null); invalidate(); }}
          />
        )}
      </AnimatePresence>

      {creatingDate && null}
    </div>
  );
}

// ═══════════════════════════════════════════════════
function PostDrawer({ post, currentUserId, isAdmin, onClose, onChanged, onDeleted }: {
  post: Post; currentUserId: string; isAdmin: boolean;
  onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const canEdit = post.auteurId === currentUserId || isAdmin;
  const [texte, setTexte] = useState(post.texte);
  const [dirty, setDirty] = useState(false);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['posts-linkedin'] });

  const patchMut = useMutation({
    mutationFn: (body: Partial<Post>) => api.patch<Post>(`/posts-linkedin/${post.id}`, body),
    onSuccess: () => { invalidate(); onChanged(); },
  });
  const delMut = useMutation({
    mutationFn: () => api.delete(`/posts-linkedin/${post.id}`),
    onSuccess: onDeleted,
  });
  const commentMut = useMutation({
    mutationFn: (t: string) => api.post<Post>(`/posts-linkedin/${post.id}/comments`, { texte: t }),
    onSuccess: () => { setComment(''); invalidate(); onChanged(); },
  });
  const delCommentMut = useMutation({
    mutationFn: (cid: string) => api.delete(`/posts-linkedin/comments/${cid}`),
    onSuccess: () => { invalidate(); onChanged(); },
  });

  function saveTexte() { if (dirty) { patchMut.mutate({ texte }); setDirty(false); } }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      patchMut.mutate({ imageUrl: url });
    } catch { /* noop */ } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const dateLabel = new Date(post.datePost).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] flex flex-col"
        style={{ background: '#FCFCF5', fontFamily: "'Manrope', sans-serif" }}
      >
        {/* Header drawer */}
        <div className="flex items-start justify-between px-5 py-4" style={{ background: '#22177A' }}>
          <div className="flex items-center gap-3">
            <Avatar a={post.auteur} size={38} />
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{post.auteur.prenom} {post.auteur.nom}</div>
              <div style={{ color: 'rgba(230,233,175,.75)', fontSize: 12.5, textTransform: 'capitalize' }}>{dateLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="grid place-items-center rounded-lg" style={{ width: 32, height: 32, color: '#E6E9AF', background: 'rgba(230,233,175,.12)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Statut */}
          <label className="block text-[11px] font-bold uppercase mb-2" style={{ color: '#9A96AE', letterSpacing: '.1em' }}>Statut</label>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {STATUTS.map((s) => {
              const active = post.statut === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => patchMut.mutate({ statut: s.key })}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition"
                  style={{
                    background: active ? s.dot : s.bg,
                    color: active ? '#fff' : s.text,
                    boxShadow: active ? `0 4px 12px -4px ${s.dot}` : 'none',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#fff' : s.dot }} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Texte */}
          <label className="block text-[11px] font-bold uppercase mb-2" style={{ color: '#9A96AE', letterSpacing: '.1em' }}>Texte du post</label>
          {canEdit ? (
            <textarea
              value={texte}
              onChange={(e) => { setTexte(e.target.value); setDirty(true); }}
              onBlur={saveTexte}
              placeholder="Colle ou rédige le contenu du post LinkedIn…"
              rows={8}
              className="w-full rounded-xl border p-3 text-[14px] leading-relaxed resize-y"
              style={{ borderColor: 'rgba(34,23,122,.14)', background: '#fff', color: '#1A1533' }}
            />
          ) : (
            <div className="w-full rounded-xl border p-3 text-[14px] leading-relaxed whitespace-pre-wrap" style={{ borderColor: 'rgba(34,23,122,.1)', background: '#fff', color: '#1A1533', minHeight: 80 }}>
              {post.texte?.trim() || <span style={{ color: '#B4B0C2' }}>Aucun texte.</span>}
            </div>
          )}
          {canEdit && dirty && (
            <div className="mt-1.5 text-[12px]" style={{ color: '#9A6B12' }}>Modifié — enregistré à la sortie du champ.</div>
          )}

          {/* Image */}
          <label className="block text-[11px] font-bold uppercase mt-5 mb-2" style={{ color: '#9A96AE', letterSpacing: '.1em' }}>Visuel</label>
          {post.imageUrl ? (
            <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(34,23,122,.1)' }}>
              <img src={post.imageUrl} alt="" className="w-full object-cover" style={{ maxHeight: 320 }} />
              {canEdit && (
                <button onClick={() => patchMut.mutate({ imageUrl: null })} className="absolute top-2 right-2 grid place-items-center rounded-lg" style={{ width: 30, height: 30, background: 'rgba(0,0,0,.55)', color: '#fff' }}><Trash2 size={15} /></button>
              )}
            </div>
          ) : canEdit ? (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-xl border-2 border-dashed py-6 flex flex-col items-center gap-1.5"
              style={{ borderColor: 'rgba(34,23,122,.16)', color: '#8A8699' }}
            >
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
              <span className="text-[13px] font-medium">{uploading ? 'Téléversement…' : 'Ajouter un visuel'}</span>
              <span className="text-[11.5px]" style={{ color: '#B4B0C2' }}>PNG, JPG, WEBP, GIF — max 10 Mo</span>
            </button>
          ) : (
            <div className="text-[13px]" style={{ color: '#B4B0C2' }}>Aucun visuel.</div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />

          {/* Fil de discussion */}
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(34,23,122,.1)' }}>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-bold uppercase" style={{ color: '#9A96AE', letterSpacing: '.1em' }}>Discussion</label>
              <span className="text-[12px]" style={{ color: '#B4B0C2' }}>{post.commentaires.length} message{post.commentaires.length > 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-col gap-3 mb-3">
              {post.commentaires.length === 0 && (
                <p className="text-[13px]" style={{ color: '#B4B0C2' }}>Pas encore de commentaire. Lance la discussion.</p>
              )}
              {post.commentaires.map((c) => {
                const mine = c.auteur.id === currentUserId;
                return (
                  <div key={c.id} className="flex gap-2.5 group/c">
                    <Avatar a={c.auteur} size={30} />
                    <div className="flex-1">
                      <div className="rounded-xl px-3 py-2" style={{ background: mine ? '#ECEAF8' : '#fff', border: '1px solid rgba(34,23,122,.08)' }}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[12.5px] font-bold" style={{ color: '#1A1533' }}>{c.auteur.prenom} {c.auteur.nom}</span>
                          <span className="text-[11px]" style={{ color: '#B4B0C2' }}>{new Date(c.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          {(mine || isAdmin) && (
                            <button onClick={() => delCommentMut.mutate(c.id)} className="ml-auto opacity-0 group-hover/c:opacity-100 transition" style={{ color: '#C4485B' }}><Trash2 size={13} /></button>
                          )}
                        </div>
                        <p className="text-[13.5px] whitespace-pre-wrap" style={{ color: '#3A3556' }}>{c.texte}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Barre bas : ajout commentaire + suppression post */}
        <div className="px-5 py-3.5" style={{ borderTop: '1px solid rgba(34,23,122,.1)', background: '#fff' }}>
          <div className="flex items-end gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && comment.trim()) { e.preventDefault(); commentMut.mutate(comment.trim()); } }}
              placeholder="Écrire un commentaire… (⌘/Ctrl + Entrée)"
              rows={1}
              className="flex-1 rounded-xl border px-3 py-2.5 text-[13.5px] resize-none"
              style={{ borderColor: 'rgba(34,23,122,.14)', color: '#1A1533', maxHeight: 120 }}
            />
            <button
              onClick={() => comment.trim() && commentMut.mutate(comment.trim())}
              disabled={!comment.trim() || commentMut.isPending}
              className="grid place-items-center rounded-xl"
              style={{ width: 44, height: 44, background: comment.trim() ? '#22177A' : '#D8D5E4', color: '#fff' }}
            >
              {commentMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          {canEdit && (
            <button
              onClick={() => { if (confirm('Supprimer ce post ?')) delMut.mutate(); }}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
              style={{ color: '#C4485B' }}
            ><Trash2 size={14} /> Supprimer le post</button>
          )}
        </div>
      </motion.aside>
    </>
  );
}
