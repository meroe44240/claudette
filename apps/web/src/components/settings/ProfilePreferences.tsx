// Langue et fuseau du membre connecté (User.preferredLanguage / User.timezone).
// Ils pilotent l'interface, les emails internes (briefs, notes, récaps) et la
// langue des contenus générés par l'IA pour ce membre.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { t, lang as uiLang, setLang, browserTimeZone, type Lang } from '../../lib/i18n';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

interface Me { preferredLanguage: string | null; timezone: string | null }

const COMMON_ZONES = ['Europe/Paris', 'Europe/London', 'Asia/Ho_Chi_Minh', 'Asia/Singapore', 'America/New_York', 'America/Montreal'];

function allTimeZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (list?.length) return list;
  } catch { /* navigateur ancien */ }
  return COMMON_ZONES;
}

/** « 19:30 » maintenant dans ce fuseau, pour vérifier le choix. */
function nowIn(tz: string): string {
  try { return new Date().toLocaleTimeString(uiLang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }); } catch { return ''; }
}

export default function ProfilePreferences() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['auth', 'me'], queryFn: () => api.get<Me>('/auth/me') });
  const [language, setLanguage] = useState<Lang>(uiLang);
  const [timezone, setTimezone] = useState<string>(browserTimeZone() || 'Europe/Paris');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    if (me.preferredLanguage === 'fr' || me.preferredLanguage === 'en') setLanguage(me.preferredLanguage);
    if (me.timezone) setTimezone(me.timezone);
  }, [me]);

  const zoneOptions = useMemo(() => {
    const all = allTimeZones();
    const ordered = [...COMMON_ZONES.filter((z) => all.includes(z)), ...all.filter((z) => !COMMON_ZONES.includes(z))];
    if (!ordered.includes(timezone)) ordered.unshift(timezone);
    return ordered.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
  }, [timezone]);

  async function save() {
    setSaving(true);
    try {
      await api.put('/auth/me', { preferredLanguage: language, timezone });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast('success', t('Préférences enregistrées'));
      if (language !== uiLang) await setLang(language); // recharge l'interface dans la nouvelle langue
    } catch {
      toast('error', t('Échec de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-neutral-900">{t('Mon profil')}</h2>
        <p className="mt-1 text-[13px] text-neutral-500">{t('Votre langue et votre fuseau : interface, emails (briefs, notes, récaps) et contenus générés par l’IA.')}</p>
      </div>
      <div className="space-y-6">
        <Select
          label={t('Langue')}
          options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]}
          value={language}
          onChange={(v) => setLanguage(v === 'fr' ? 'fr' : 'en')}
        />
        <div>
          <Select label={t('Fuseau horaire')} options={zoneOptions} value={timezone} onChange={setTimezone} searchable />
          <p className="mt-1.5 text-[12px] text-neutral-500">{t('Heure actuelle dans ce fuseau : {time}', { time: nowIn(timezone) })}</p>
        </div>
        <Button onClick={save} disabled={saving}>{t('Enregistrer')}</Button>
      </div>
    </div>
  );
}
