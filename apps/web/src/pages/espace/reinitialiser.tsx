// Espace candidat : choisir un nouveau mot de passe depuis le lien reçu par email.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Page, C, card, btn, input, label, LOGO, ErrorNote, espaceFetch, espaceStore } from './espace-ui';
import { t } from '../../lib/i18n';

export default function EspaceResetPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = t('Nouveau mot de passe | Espace candidat Humanup'); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 10) return setError(t('Votre mot de passe doit contenir au moins 10 caractères.'));
    if (pw !== pw2) return setError(t('Les deux mots de passe ne correspondent pas.'));
    setError('');
    setBusy(true);
    try {
      const r = await espaceFetch<{ token: string }>('/public/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, password: pw }) });
      espaceStore.set(r.token);
      navigate('/espace', { replace: true });
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
          </div>
          <form onSubmit={submit} style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: C.ink }}>{t('Choisissez un nouveau mot de passe')}</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="r-pw" style={label}>{t('Nouveau mot de passe')}</label>
              <input id="r-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} style={input} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="r-pw2" style={label}>{t('Confirmer le mot de passe')}</label>
              <input id="r-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={input} />
            </div>
            <span style={{ fontSize: 13, color: C.muted }}>{t('Au moins 10 caractères.')}</span>
            {error && <ErrorNote>{error}</ErrorNote>}
            <button type="submit" disabled={busy || !token} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{t('Enregistrer et ouvrir mon espace')}</button>
          </form>
        </div>
      </div>
    </Page>
  );
}
