import { useState } from 'react';

// Rend une note dense (CV importé, note libre) lisible : détecte les sections
// type CV (PROFIL, EXPÉRIENCE, COMPÉTENCES…) → titres navy en gras, et tronque
// les notes longues avec « Voir plus / Voir moins ».

const NOTE_SECTIONS = [
  'PROFIL PROFESSIONNEL', 'PROFIL', 'RÉSUMÉ', 'RESUME', 'À PROPOS', 'BIO',
  'EXPÉRIENCE PROFESSIONNELLE', 'EXPÉRIENCES PROFESSIONNELLES', 'EXPÉRIENCE', 'EXPÉRIENCES', 'EXPERIENCE', 'EXPERIENCES', 'PARCOURS',
  'FORMATION', 'FORMATIONS', 'DIPLÔMES', 'DIPLOMES', 'ÉTUDES',
  'COMPÉTENCES CLÉS', 'COMPÉTENCES', 'COMPETENCES', 'SKILLS', 'SAVOIR-FAIRE',
  'LANGUES', 'CERTIFICATIONS', 'CENTRES D\'INTÉRÊT', 'CENTRES D\'INTERET', 'INTÉRÊTS', 'LOISIRS',
  'INFORMATIONS COMPLÉMENTAIRES', 'CONTACT', 'COORDONNÉES', 'OBJECTIF', 'MOBILITÉ',
];

const noteNorm = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const NOTE_SECTIONS_NORM = new Set(NOTE_SECTIONS.map(noteNorm));

// Pattern d'une section : MAJUSCULES uniquement (convention CV → évite de
// matcher le mot en minuscule dans une phrase), insensible aux accents.
function noteSectionPattern(section: string): string {
  let s = section.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  s = s
    .replace(/[EÉÈÊË]/g, '[EÉÈÊË]')
    .replace(/[AÀÂÄ]/g, '[AÀÂÄ]')
    .replace(/[IÏÎ]/g, '[IÏÎ]')
    .replace(/[OÔÖ]/g, '[OÔÖ]')
    .replace(/[UÙÛÜ]/g, '[UÙÛÜ]')
    .replace(/[CÇ]/g, '[CÇ]');
  return s;
}

function structureNoteText(raw: string): string {
  const t0 = raw.replace(/\s+/g, ' ').trim();
  const sorted = [...NOTE_SECTIONS].sort((a, b) => b.length - a.length).map(noteSectionPattern);
  const re = new RegExp(`\\s*\\b(${sorted.join('|')})\\b\\s*`, 'g');
  const t = t0.replace(re, '\n\n$1\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

export default function NoteContent({ text, color = '#4A4568' }: { text: string; color?: string }) {
  const [open, setOpen] = useState(false);
  const structured = structureNoteText(text);
  const long = structured.length > 340;
  const shown = open || !long ? structured : structured.slice(0, 340).replace(/\s+\S*$/, '') + '…';
  const lines = shown.split('\n');
  return (
    <div style={{ fontSize: 13, lineHeight: 1.55, color }}>
      {lines.map((ln, i) => {
        if (ln.trim() === '') return <div key={i} style={{ height: 5 }} />;
        const isHeader = NOTE_SECTIONS_NORM.has(noteNorm(ln));
        return isHeader ? (
          <div key={i} style={{ fontWeight: 800, fontSize: 10.5, letterSpacing: '.06em', color: '#22177A', marginTop: 7, marginBottom: 1 }}>{ln.trim()}</div>
        ) : (
          <div key={i}>{ln}</div>
        );
      })}
      {long && (
        <button onClick={() => setOpen((o) => !o)} style={{ marginTop: 5, background: 'none', border: 'none', color: '#22177A', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 }}>
          {open ? 'Voir moins' : 'Voir plus'}
        </button>
      )}
    </div>
  );
}
