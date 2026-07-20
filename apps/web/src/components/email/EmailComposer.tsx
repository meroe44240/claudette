import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, ChevronDown, Variable } from 'lucide-react';
import { api } from '../../lib/api-client';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { Textarea } from '../ui/Input';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

interface EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  entiteType?: string;
  entiteId?: string;
  candidatId?: string;
  clientId?: string;
}

const VARIABLES = [
  { label: 'Nom candidat', value: '{{candidat_nom}}' },
  { label: 'Prénom candidat', value: '{{candidat_prenom}}' },
  { label: 'Email candidat', value: '{{candidat_email}}' },
  { label: 'Poste candidat', value: '{{candidat_poste}}' },
  { label: 'Nom client', value: '{{client_nom}}' },
  { label: 'Prénom client', value: '{{client_prenom}}' },
  { label: 'Entreprise', value: '{{entreprise_nom}}' },
  { label: 'Titre du mandat', value: '{{mandat_titre}}' },
];

export default function EmailComposer({
  isOpen,
  onClose,
  defaultTo = '',
  defaultSubject = '',
  defaultBody = '',
  entiteType,
  entiteId,
  candidatId,
  clientId,
}: EmailComposerProps) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [showVariables, setShowVariables] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Reset form when modal opens with new defaults
  useEffect(() => {
    if (isOpen) {
      setTo(defaultTo);
      setCc('');
      setSubject(defaultSubject);
      setBody(defaultBody);
      setShowVariables(false);
    }
  }, [isOpen, defaultTo, defaultSubject, defaultBody]);

  const handleClose = () => {
    setTo('');
    setCc('');
    setSubject('');
    setBody('');
    setShowVariables(false);
    onClose();
  };

  const sendMutation = useMutation({
    mutationFn: (payload: {
      to: string;
      subject: string;
      body: string;
      cc?: string;
      entiteType?: string;
      entiteId?: string;
      candidatId?: string;
      clientId?: string;
    }) => api.post('/emails/send', payload),
    onSuccess: () => {
      toast('success', 'Email envoyé avec succès');
      handleClose();
    },
    onError: (error: Error & { data?: { message?: string } }) => {
      const message = (error as any).data?.message || "Erreur lors de l'envoi de l'email";
      toast('error', message);
    },
  });

  const insertVariable = (variable: string) => {
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = body.substring(0, start) + variable + body.substring(end);
      setBody(newBody);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      setBody(body + variable);
    }
    setShowVariables(false);
  };

  const handleSend = () => {
    if (!to.trim()) {
      toast('warning', 'Veuillez saisir un destinataire');
      return;
    }
    if (!subject.trim()) {
      toast('warning', 'Veuillez saisir un sujet');
      return;
    }
    sendMutation.mutate({
      to: to.trim(),
      subject: subject.trim(),
      body,
      cc: cc.trim() || undefined,
      entiteType,
      entiteId,
      candidatId,
      clientId,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Composer un email" size="lg">
      <div className="space-y-4">
        <Input
          label="Destinataire"
          type="email"
          placeholder="email@exemple.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />

        <Input
          label="Cc"
          type="email"
          placeholder="cc@exemple.com (optionnel)"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
        />

        <Input
          label="Sujet"
          placeholder="Objet de l'email..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="relative">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-text-primary">Message</label>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVariables(!showVariables)}
              >
                <Variable size={14} />
                Variables
                <ChevronDown size={14} />
              </Button>
              {showVariables && (
                <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-border bg-bg-card py-1 shadow-lg">
                  <div className="max-h-48 overflow-y-auto">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.value}
                        onClick={() => insertVariable(v.value)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-secondary"
                      >
                        <span>{v.label}</span>
                        <span className="font-mono text-xs text-text-tertiary">{v.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <Textarea
            ref={bodyRef}
            placeholder="Votre message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={sendMutation.isPending}>
            <Send size={16} />
            {sendMutation.isPending ? 'Envoi...' : 'Envoyer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
