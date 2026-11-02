// Espace candidat : connexion, et demande d'un nouveau mot de passe.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, C, card, btn, input, label, linkBtn, LOGO, ErrorNote, espaceFetch, espaceStore } from './espace-ui';
import { t } from '../../lib/i18n';

export default function EspaceLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'reset' | 'sent'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = t('Connexion | Espace candidat Humanup'); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = await espaceFetch<{ token: string }>('/public/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        espaceStore.set(r.token);
        navigate('/espace', { replace: true });
      } else {
        await espaceFetch('/public/password-reset', { method: 'POST', body: JSON.stringify({ email }) });
        setMode('sent');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page header={false}>
      <div style={{ padding: '56px 20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={LOGO} alt={t('Logo Humanup')} style={{ width: 36, height: 36, borderRadius: '50%' }} />
            <span style={{ fontWeight: 700, color: C.ink, fontSize: 16 }}>Humanup</span>
            <span style={{ color: C.muted, fontSize: 14 }}>{t('Espace candidat')}</span>
          </div>
          <form onSubmit={submit} style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'sent' ? (
              <>
                <h1 style={{ margin: 0, fontSize: 22, color: C.ink }}>{t('Consultez votre boîte mail')}</h1>
                <p style={{ margin: 0 }}>{t('Si un compte existe pour {email}, vous recevrez un lien pour choisir un nouveau mot de passe. Il est valable une heure.', { email })}</p>
                <button type="button" onClick={() => setMode('login')} style={linkBtn}>{t('Retour à la connexion')}</button>
              </>
            ) : (
              <>
                <h1 style={{ margin: 0, fontSize: 22, color: C.ink }}>{mode === 'login' ? t('Connectez-vous à votre espace') : t('Obtenir un nouveau mot de passe')}</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="e-email" style={label}>{t('Email')}</label>
                  <input id="e-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
                </div>
                {mode === 'login' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label htmlFor="e-pw" style={label}>{t('Mot de passe')}</label>
                    <input id="e-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
                  </div>
                )}
                {error && <ErrorNote>{error}</ErrorNote>}
                <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{mode === 'login' ? t('Se connecter') : t("M'envoyer un lien")}</button>
                <button type="button" onClick={() => { setError(''); setMode(mode === 'login' ? 'reset' : 'login'); }} style={{ ...linkBtn, alignSelf: 'center' }}>
                  {mode === 'login' ? t('Mot de passe oublié ?') : t('Retour à la connexion')}
                </button>
              </>
            )}
          </form>
          <p style={{ margin: 0, fontSize: 14, color: C.muted }}>{t('Votre espace est ouvert par votre équipe Humanup après votre premier appel. Des questions :')} <a href="mailto:meroe@humanup.io">meroe@humanup.io</a></p>
        </div>
      </div>
    </Page>
  );
}
