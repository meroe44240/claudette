import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calendar, Video, Phone, Users, Coffee, Check, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api-client';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { Textarea } from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { toast } from '../ui/Toast';

interface ScheduleMeetingProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultParticipants?: string[];
  entiteType?: string;
  entiteId?: string;
}

const MEETING_TYPES = [
  { value: 'entretien_candidat', label: 'Entretien candidat', icon: '👤' },
  { value: 'entretien_client', label: 'Entretien client', icon: '🏢' },
  { value: 'call_interne', label: 'Call interne', icon: '📞' },
  { value: 'suivi', label: 'Point de suivi', icon: '🔄' },
  { value: 'debrief', label: 'Debrief', icon: '📋' },
  { value: 'autre', label: 'Autre', icon: '📅' },
];

const durationOptions = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 heure' },
  { value: '90', label: '1h30' },
  { value: '120', label: '2 heures' },
];

export default function ScheduleMeeting({
  isOpen,
  onClose,
  defaultTitle = '',
  defaultParticipants = [],
  entiteType,
  entiteId,
}: ScheduleMeetingProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [meetingType, setMeetingType] = useState('entretien_candidat');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [participants, setParticipants] = useState(defaultParticipants.join(', '));
  const [notes, setNotes] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<{ success: boolean; message: string; googleEventId?: string } | null>(null);

  const handleClose = () => {
    setTitle('');
    setMeetingType('entretien_candidat');
    setDate('');
    setStartTime('09:00');
    setDuration('60');
    setParticipants('');
    setNotes('');
    setSendEmail(true);
    setResult(null);
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      meetingType: string;
      date: string;
      startTime: string;
      duration: number;
      participants: string[];
      notes: string;
      sendEmail: boolean;
      entiteType?: string;
      entiteId?: string;
    }) => api.post<{ success: boolean; message: string; googleEventId?: string }>(
      '/integrations/calendar/events',
      payload,
    ),
    onSuccess: (data) => {
      setResult(data);
      if (data.success) {
        toast('success', 'RDV planifié et ajouté au calendrier !');
      } else {
        toast('warning', data.message || 'RDV enregistré mais pas dans le calendrier');
      }
    },
    onError: () => {
      toast('error', 'Erreur lors de la planification');
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      toast('warning', 'Veuillez saisir un titre');
      return;
    }
    if (!date) {
      toast('warning', 'Veuillez sélectionner une date');
      return;
    }

    const participantsList = participants
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    createMutation.mutate({
      title: title.trim(),
      meetingType,
      date,
      startTime,
      duration: parseInt(duration, 10),
      participants: participantsList,
      notes: notes.trim(),
      sendEmail,
      entiteType,
      entiteId,
    });
  };

  const selectedType = MEETING_TYPES.find((t) => t.value === meetingType);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Planifier un rendez-vous" size="lg">
      <div className="space-y-4">
        {/* Meeting type */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Type de rendez-vous</label>
          <div className="grid grid-cols-3 gap-2">
            {MEETING_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setMeetingType(type.value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  meetingType === type.value
                    ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-sm'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <span>{type.icon}</span>
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Titre"
          placeholder="Entretien, réunion, etc."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Heure de début"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Select
            label="Durée"
            options={durationOptions}
            value={duration}
            onChange={setDuration}
          />
        </div>

        <Input
          label="Participants (emails)"
          placeholder="email1@exemple.com, email2@exemple.com"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
        />

        <Textarea
          label="Notes"
          placeholder="Notes ou ordre du jour (optionnel)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />

        {/* Send email toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="rounded border-neutral-300"
          />
          <span className="text-sm text-neutral-600">
            Envoyer une invitation par email aux participants
          </span>
        </label>

        {/* Result feedback */}
        {result && (
          <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
            result.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {result.success ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{result.success ? 'Événement créé !' : 'Attention'}</p>
              <p className="text-xs mt-0.5 opacity-80">{result.message}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            {result ? 'Fermer' : 'Annuler'}
          </Button>
          {!result && (
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              <Calendar size={16} />
              {createMutation.isPending ? 'Planification...' : 'Planifier'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
