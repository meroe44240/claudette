import { useNavigate } from 'react-router';
import { Mail, Calendar, Phone, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';

const NAVY = '#22177A';
const LIME = '#E6E9AF';
const INK = '#1A1533';

interface Step {
  n: number;
  text: React.ReactNode;
}

function GuideCard({
  icon,
  color,
  title,
  subtitle,
  steps,
  note,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  subtitle: string;
  steps: Step[];
  note?: React.ReactNode;
}) {
  return (
    <div
      className="rise"
      style={{
        background: '#fff',
        border: '1px solid rgba(34,23,122,0.08)',
        borderRadius: 18,
        boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            background: `${color}18`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 18, color: INK }}>{title}</div>
          <div style={{ fontSize: 13, color: '#6E6A85', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>

      <ol style={{ listStyle: 'none', margin: '18px 0 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((s) => (
          <li key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              style={{
                flexShrink: 0,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: NAVY,
                color: LIME,
                fontSize: 12,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              {s.n}
            </span>
            <span style={{ fontSize: 14, color: '#3A3550', lineHeight: 1.55 }}>{s.text}</span>
          </li>
        ))}
      </ol>

      {note && (
        <div
          style={{
            marginTop: 16,
            padding: '11px 14px',
            background: '#F2F3D8',
            border: '1px solid rgba(34,23,122,0.12)',
            borderRadius: 12,
            fontSize: 12.5,
            color: '#4A4568',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <CheckCircle2 size={15} color={NAVY} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsGuidePage() {
  usePageTitle('Guide — Connecter mes outils');
  const navigate = useNavigate();

  const b = (t: string) => <strong style={{ color: INK }}>{t}</strong>;

  return (
    <div style={{ maxWidth: 760 }}>
      {/* HEADER */}
      <div>
        <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Intégrations</div>
        <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 34, letterSpacing: '-0.03em', color: INK, marginTop: 4 }}>
          Connecter mes outils
        </h1>
        <p style={{ fontSize: 14.5, color: '#6E6A85', marginTop: 6, lineHeight: 1.6 }}>
          Chaque membre connecte <strong>son propre</strong> compte : ta boîte Gmail, ton agenda Google et ta téléphonie
          Allo. Ça prend 2 minutes et ça active la synchro des mails, des RDV et des appels dans l'ATS.
        </p>
      </div>

      {/* CTA vers la page intégrations */}
      <button
        onClick={() => navigate('/settings/integrations')}
        style={{
          marginTop: 16,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 700,
          fontSize: 14,
          background: NAVY,
          color: LIME,
          border: 'none',
          borderRadius: 12,
          padding: '12px 20px',
          cursor: 'pointer',
        }}
      >
        Ouvrir mes intégrations <ArrowRight size={16} />
      </button>

      {/* CARTES */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
        <GuideCard
          icon={<Mail size={22} />}
          color="#D93F3F"
          title="Gmail"
          subtitle="Ta boîte mail dans l'ATS + auto-log des échanges"
          steps={[
            { n: 1, text: <>Va dans {b('Paramètres → Intégrations')} (ou clique « Ouvrir mes intégrations » ci-dessus).</> },
            { n: 2, text: <>Sur la carte {b('Gmail')}, clique {b('« Connecter Gmail »')}.</> },
            { n: 3, text: <>Une fenêtre Google s'ouvre : choisis <strong>ton compte HumanUp</strong> et clique {b('« Autoriser »')}.</> },
            { n: 4, text: <>Tu reviens sur l'ATS, la carte passe en {b('« Connecté »')} ✅.</> },
          ]}
          note={<>Autorise bien avec ton adresse <strong>@humanup.io</strong>, pas un compte perso.</>}
        />

        <GuideCard
          icon={<Calendar size={22} />}
          color="#2A6BD8"
          title="Google Agenda"
          subtitle="Tes RDV + le lien Google Meet auto des réservations"
          steps={[
            { n: 1, text: <>Toujours dans {b('Paramètres → Intégrations')}, carte {b('Google Agenda')}.</> },
            { n: 2, text: <>Clique {b('« Connecter »')} et autorise avec <strong>le même compte Google</strong> que Gmail.</> },
            { n: 3, text: <>C'est bon : tes RDV se synchronisent et tes pages de réservation généreront un lien Meet automatiquement.</> },
          ]}
          note={<>Gmail et Agenda utilisent le même compte Google — souvent connectés d'un coup.</>}
        />

        <GuideCard
          icon={<Phone size={22} />}
          color="#3B9A54"
          title="Allo (Téléphonie)"
          subtitle="Click-to-call + logs d'appels automatiques"
          steps={[
            { n: 1, text: <>Récupère ta {b('clé API Allo')} dans ton compte Allo (rubrique paramètres / API).</> },
            { n: 2, text: <>Dans l'ATS : carte {b('Allo (Téléphonie)')} → {b('« Configurer Allo »')}.</> },
            { n: 3, text: <>Colle ta clé API et {b('valide')}. La carte passe en {b('« Connecté »')} ✅.</> },
          ]}
          note={<>La clé Allo ne « expire » pas comme Gmail : une fois posée, c'est bon durablement.</>}
        />
      </div>

      {/* AIDE */}
      <div
        className="rise"
        style={{
          marginTop: 16,
          padding: '16px 18px',
          background: '#FCFCF5',
          border: '1px solid rgba(34,23,122,0.1)',
          borderRadius: 14,
          fontSize: 13.5,
          color: '#4A4568',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: INK }}>Ça bloque ?</strong> Si la fenêtre Google se ferme sans rien, vérifie que tu es
        déconnecté d'un compte perso Google, puis réessaie. Pour Allo, si la clé est refusée, re-copie-la sans espace.
        En cas de souci, préviens l'admin.
        <a
          href="https://ats.propium.co/settings/integrations"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: NAVY, fontWeight: 700, marginLeft: 6 }}
        >
          Page intégrations <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
