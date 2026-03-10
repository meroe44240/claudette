import { useState } from 'react';
import { Calendar, Clock, Save } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const DEFAULT_SLOTS = DAYS.map(day => ({ day, start: '09:00', end: '18:00', enabled: true }));

export default function InterviewSchedulerPage() {
  const [slots, setSlots] = useState(DEFAULT_SLOTS);

  const updateSlot = (index: number, field: string, value: string | boolean) => {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title="Planificateur d'entretiens"
        subtitle="Configurez vos créneaux de disponibilité pour les entretiens"
      />

      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-neutral-900">
          <Calendar className="h-5 w-5 text-violet-500" />
          Disponibilités hebdomadaires
        </h3>

        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={slot.day} className="flex items-center gap-4 rounded-lg border border-neutral-100 p-3">
              <label className="flex items-center gap-2 w-28">
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={e => updateSlot(i, 'enabled', e.target.checked)}
                  className="rounded border-neutral-300 text-violet-600"
                />
                <span className="text-sm font-medium text-neutral-700">{slot.day}</span>
              </label>

              {slot.enabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={slot.start}
                    onChange={e => updateSlot(i, 'start', e.target.value)}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
                  />
                  <span className="text-neutral-400">&mdash;</span>
                  <input
                    type="time"
                    value={slot.end}
                    onChange={e => updateSlot(i, 'end', e.target.value)}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => toast('success', 'Disponibilités sauvegardées')}>
            <Save className="mr-2 h-4 w-4" />
            Sauvegarder
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-neutral-900">
          <Clock className="h-5 w-5 text-violet-500" />
          Paramètres d'entretien
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-600">Durée par défaut</label>
            <select defaultValue="60" className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">Buffer entre entretiens</label>
            <select defaultValue="15" className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <option value="0">Aucun</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
