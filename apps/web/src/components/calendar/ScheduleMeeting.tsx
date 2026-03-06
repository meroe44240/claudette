import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
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

const durationOptions = [
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
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [participants, setParticipants] = useState(defaultParticipants.join(', '));
  const [notes, setNotes] = useState('');

  const handleClose = () => {
    setTitle('');
    setDate('');
    setStartTime('09:00');
    setDuration('60');
    setParticipants('');
    setNotes('');
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      date: string;
      startTime: string;
      duration: number;
      participants: string[];
      notes: string;
      entiteType?: string;
      entiteId?: string;
    }) => api.post('/integrations/calendar/events', payload),
    onSuccess: () => {
      toast('success', 'Rendez-vous planifié avec succès');
      handleClose();
    },
    onError: () => {
      toast('error', 'Erreur lors de la planification du rendez-vous');
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
      date,
      startTime,
      duration: parseInt(duration, 10),
      participants: participantsList,
      notes: notes.trim(),
      entiteType,
      entiteId,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Planifier un rendez-vous" size="lg">
      <div className="space-y-4">
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
          label="Participants"
          placeholder="email1@exemple.com, email2@exemple.com"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
        />

        <Textarea
          label="Notes"
          placeholder="Notes ou ordre du jour (optionnel)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            <Calendar size={16} />
            {createMutation.isPending ? 'Planification...' : 'Planifier'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
