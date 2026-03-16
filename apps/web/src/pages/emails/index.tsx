import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Inbox,
  Send,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  User,
  Loader2,
  AlertCircle,
  MailOpen,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast, ToastContainer } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface EmailContact {
  id: string;
  nom: string;
  prenom: string;
  type: 'candidat' | 'client';
}

interface EmailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to?: string;
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
  isSent?: boolean;
  contact: EmailContact | null;
}

interface EmailsResponse {
  messages: EmailMessage[];
  nextPageToken: string | null;
  resultSizeEstimate: number;
}

type FilterType = 'all' | 'inbox' | 'sent';

const FILTER_OPTIONS: { value: FilterType; label: string; icon: typeof Mail }[] = [
  { value: 'all', label: 'Tous', icon: Mail },
  { value: 'inbox', label: 'Reçus', icon: Inbox },
  { value: 'sent', label: 'Envoyés', icon: Send },
];

// ─── HELPER ──────────────────────────────────────────────────────────────────

function formatEmailDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffH < 24) return `Il y a ${diffH}h`;

    // Same year? Show day + month
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function EmailsPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(timeout);
  }, [search]);

  // Fetch emails
  const fetchEmails = useCallback(async (pageToken?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('maxResults', '20');
      params.set('filter', filter);
      if (searchDebounced) params.set('q', searchDebounced);
      if (pageToken) params.set('pageToken', pageToken);

      const data = await api.get<EmailsResponse>(`/integrations/gmail/messages?${params.toString()}`);
      setMessages(data.messages);
      setNextPageToken(data.nextPageToken);
      setConnected(true);
    } catch (err: any) {
      if (err?.message?.includes('non configuree') || err?.message?.includes('desactivee') || err?.statusCode === 400) {
        setConnected(false);
        setMessages([]);
      } else {
        toast('error', err?.message || 'Impossible de charger les emails.');
      }
    } finally {
      setLoading(false);
    }
  }, [filter, searchDebounced]);

  // Load on mount and when filter/search changes
  useEffect(() => {
    setCurrentPage(0);
    setPageTokens([]);
    fetchEmails();
  }, [fetchEmails]);

  // Handle sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/integrations/email/sync', {});
      toast('success', 'Synchronisation terminée !');
      fetchEmails();
    } catch (err: any) {
      toast('error', err?.message || 'Erreur de synchronisation.');
    } finally {
      setSyncing(false);
    }
  };

  // Pagination
  const handleNextPage = () => {
    if (!nextPageToken) return;
    setPageTokens(prev => [...prev, nextPageToken]);
    setCurrentPage(prev => prev + 1);
    fetchEmails(nextPageToken);
  };

  const handlePrevPage = () => {
    if (currentPage === 0) return;
    const newPage = currentPage - 1;
    setCurrentPage(newPage);
    const token = newPage === 0 ? undefined : pageTokens[newPage - 1];
    fetchEmails(token);
  };

  // Open in Gmail
  const openInGmail = (messageId: string) => {
    window.open(`https://mail.google.com/mail/u/0/#inbox/${messageId}`, '_blank');
  };

  // Navigate to contact
  const goToContact = (contact: EmailContact) => {
    if (contact.type === 'candidat') {
      navigate(`/candidats/${contact.id}`);
    } else {
      navigate(`/clients/${contact.id}`);
    }
  };

  // ─── NOT CONNECTED STATE ──────────────────────────────────────────────────
  if (!connected && !loading) {
    return (
      <div>
        <ToastContainer />
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-neutral-900">Emails</h1>
          <p className="text-[14px] text-neutral-500 mt-1">Vos emails Gmail synchronisés</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-amber-500" />
          </div>
          <h2 className="text-[17px] font-semibold text-neutral-900 mb-2">Gmail non connecté</h2>
          <p className="text-[14px] text-neutral-500 mb-6 max-w-md mx-auto">
            Connectez votre compte Gmail dans les paramètres pour synchroniser vos emails.
          </p>
          <button
            onClick={() => navigate('/settings/integrations')}
            className="h-10 px-5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-[14px] font-medium transition-colors"
          >
            Configurer Gmail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ToastContainer />

      <PageHeader
        title="Emails"
        subtitle="Vos emails Gmail synchronisés"
        breadcrumbs={[{ label: 'Emails' }]}
        actions={
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 h-9 px-4 bg-white border border-neutral-200 rounded-lg text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sync...' : 'Synchroniser'}
          </button>
        }
      />

      {/* Filters + Search */}
      <div className="flex items-center gap-3 mb-5">
        {/* Filter pills */}
        <div className="flex items-center bg-neutral-50 rounded-lg p-1 border border-neutral-100">
          {FILTER_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                  isActive
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Icon size={14} />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xs relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou sujet..."
            className="w-full h-9 pl-9 pr-3 text-[13px] border border-neutral-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Email List */}
      <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-neutral-400" />
            <span className="ml-3 text-[14px] text-neutral-500">Chargement des emails...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <MailOpen size={32} className="text-neutral-300 mx-auto mb-3" />
            <p className="text-[14px] text-neutral-500">
              {searchDebounced ? 'Aucun email trouvé pour cette recherche.' : 'Aucun email à afficher.'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${filter}-${currentPage}-${searchDebounced}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  onClick={() => openInGmail(msg.id)}
                  className={`flex items-center gap-4 px-5 py-3.5 border-b border-neutral-50 cursor-pointer transition-colors hover:bg-neutral-50/80 ${
                    !msg.isRead ? 'bg-blue-50/40' : ''
                  }`}
                >
                  {/* Read/unread indicator */}
                  <div className="shrink-0 w-2">
                    {!msg.isRead && (
                      <div className="w-2 h-2 rounded-full bg-primary-500" />
                    )}
                  </div>

                  {/* Sender avatar */}
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-semibold ${
                    msg.isSent
                      ? 'bg-emerald-50 text-emerald-600'
                      : msg.contact
                        ? 'bg-primary-50 text-primary-600'
                        : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    {msg.isSent ? <Send size={14} /> : (msg.from.name[0] || '?').toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {/* Sender name */}
                      <span className={`text-[14px] truncate ${!msg.isRead ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
                        {msg.isSent ? `À : ${msg.to?.split('<')[0]?.trim() || msg.to || ''}` : msg.from.name}
                      </span>

                      {/* Contact badge */}
                      {msg.contact && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToContact(msg.contact!);
                          }}
                          className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-600 rounded-md text-[11px] font-medium hover:bg-primary-100 transition-colors"
                          title={`Voir la fiche ${msg.contact.type}`}
                        >
                          <User size={10} />
                          {msg.contact.prenom} {msg.contact.nom}
                        </button>
                      )}
                    </div>

                    {/* Subject + snippet */}
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[13px] truncate ${!msg.isRead ? 'font-medium text-neutral-800' : 'text-neutral-600'}`}>
                        {msg.subject}
                      </span>
                      <span className="text-[12px] text-neutral-400 truncate hidden sm:inline">
                        {msg.snippet}
                      </span>
                    </div>
                  </div>

                  {/* Date + external link */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`text-[12px] whitespace-nowrap ${!msg.isRead ? 'font-semibold text-primary-600' : 'text-neutral-400'}`}>
                      {formatEmailDate(msg.date)}
                    </span>
                    <ExternalLink size={12} className="text-neutral-300" />
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Pagination */}
        {(currentPage > 0 || nextPageToken) && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100 bg-neutral-50/50">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
              Précédent
            </button>
            <span className="text-[12px] text-neutral-400">Page {currentPage + 1}</span>
            <button
              onClick={handleNextPage}
              disabled={!nextPageToken}
              className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Suivant
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
