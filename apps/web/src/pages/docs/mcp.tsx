/**
 * Guide MCP HumanUp — Documentation publique
 * URL: /docs/mcp
 * Page publique sans authentification
 */

import { useState } from 'react';
import {
  Search, Users, Building2, Briefcase, ListTodo, Mail, BarChart3,
  Brain, StickyNote, Send, Shield, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, BookOpen, Zap, MessageSquare,
  ArrowRight, ExternalLink, Copy, Check, Monitor, Sparkles,
} from 'lucide-react';
import { t } from '../../lib/i18n';

// ─── DATA ──────────────────────────────────────────

const TOOLS = [
  {
    category: t('Candidats'),
    icon: Users,
    color: 'text-blue-600 bg-blue-50',
    tools: [
      { name: 'search_candidates', desc: t('Rechercher des candidats'), level: 'free' },
      { name: 'get_candidate', desc: t("Fiche complete d'un candidat"), level: 'free' },
      { name: 'suggest_candidates_for_mandate', desc: t('Suggestions pour un mandat'), level: 'free' },
      { name: 'create_candidate', desc: t('Creer un candidat'), level: 'confirm' },
      { name: 'update_candidate', desc: t('Modifier un candidat'), level: 'confirm' },
      { name: 'get_candidate_dossier', desc: t('Lire le dossier client (portail)'), level: 'free' },
      { name: 'update_candidate_dossier', desc: t('Modifier le dossier client (portail)'), level: 'confirm' },
      { name: 'list_candidate_debriefs', desc: t("Lister les debriefs d'entretien"), level: 'free' },
      { name: 'add_candidate_debrief', desc: t('Ajouter un debrief (texte, lien ou PDF)'), level: 'confirm' },
      { name: 'apply_candidate_debrief', desc: t("Appliquer la proposition d'un debrief"), level: 'confirm' },
      { name: 'delete_candidate', desc: t('Supprimer un candidat'), level: 'confirm' },
    ],
  },
  {
    category: t('Clients'),
    icon: Users,
    color: 'text-emerald-600 bg-emerald-50',
    tools: [
      { name: 'search_clients', desc: t('Rechercher des clients'), level: 'free' },
      { name: 'get_client', desc: t("Fiche complete d'un client"), level: 'free' },
      { name: 'create_client', desc: t('Creer un client'), level: 'confirm' },
      { name: 'update_client', desc: t('Modifier un client'), level: 'confirm' },
    ],
  },
  {
    category: t('Entreprises'),
    icon: Building2,
    color: 'text-purple-600 bg-purple-50',
    tools: [
      { name: 'search_companies', desc: t('Rechercher des entreprises'), level: 'free' },
      { name: 'get_company', desc: t("Fiche complete d'une entreprise"), level: 'free' },
      { name: 'create_company', desc: t('Creer une entreprise'), level: 'confirm' },
      { name: 'update_company', desc: t('Modifier une entreprise'), level: 'confirm' },
    ],
  },
  {
    category: t('Mandats'),
    icon: Briefcase,
    color: 'text-orange-600 bg-orange-50',
    tools: [
      { name: 'search_mandates', desc: t('Rechercher des mandats'), level: 'free' },
      { name: 'get_mandate', desc: t("Fiche complete d'un mandat"), level: 'free' },
      { name: 'get_mandate_pipeline', desc: t("Pipeline d'un mandat"), level: 'free' },
      { name: 'create_mandate', desc: t('Creer un mandat'), level: 'admin' },
      { name: 'move_candidate_stage', desc: t('Deplacer dans le pipeline'), level: 'confirm' },
      { name: 'add_candidate_to_mandate', desc: t('Ajouter au pipeline'), level: 'confirm' },
      { name: 'remove_candidate_from_mandate', desc: t('Retirer du pipeline'), level: 'confirm' },
    ],
  },
  {
    category: t('Taches'),
    icon: ListTodo,
    color: 'text-rose-600 bg-rose-50',
    tools: [
      { name: 'get_my_tasks', desc: t('Mes taches'), level: 'free' },
      { name: 'create_task', desc: t('Creer une tache'), level: 'confirm' },
      { name: 'complete_task', desc: t('Terminer une tache'), level: 'confirm' },
    ],
  },
  {
    category: t('Sequences'),
    icon: Zap,
    color: 'text-yellow-600 bg-yellow-50',
    tools: [
      { name: 'get_my_sequences', desc: t('Mes sequences'), level: 'free' },
      { name: 'get_sequence_details', desc: t("Detail d'une sequence"), level: 'free' },
      { name: 'start_sequence', desc: t('Lancer une sequence'), level: 'confirm' },
      { name: 'pause_sequence', desc: t('Mettre en pause'), level: 'confirm' },
    ],
  },
  {
    category: t('Emails'),
    icon: Mail,
    color: 'text-cyan-600 bg-cyan-50',
    tools: [
      { name: 'get_my_emails', desc: t('Mes derniers emails'), level: 'free' },
      { name: 'send_email', desc: t('Envoyer un email'), level: 'confirm' },
    ],
  },
  {
    category: t('Stats & Brief'),
    icon: BarChart3,
    color: 'text-indigo-600 bg-indigo-50',
    tools: [
      { name: 'get_daily_brief', desc: t('Brief quotidien'), level: 'free' },
      { name: 'get_my_stats', desc: t('Mes statistiques'), level: 'free' },
      { name: 'get_my_calendar', desc: t('Mon calendrier'), level: 'free' },
      { name: 'get_my_booking_links', desc: t('Mes liens de booking'), level: 'free' },
      { name: 'get_team_stats', desc: t('Stats equipe'), level: 'admin' },
      { name: 'get_team_brief', desc: t('Brief equipe'), level: 'admin' },
      { name: 'get_recruiter_stats', desc: t("Stats d'un recruteur"), level: 'admin' },
    ],
  },
  {
    category: t('IA & Appels'),
    icon: Brain,
    color: 'text-violet-600 bg-violet-50',
    tools: [
      { name: 'get_call_brief', desc: t('Brief pre-appel'), level: 'free' },
      { name: 'click_to_call', desc: t('Lancer un appel VoIP'), level: 'free' },
      { name: 'validate_call_analysis', desc: t("Valider analyse IA d'un appel"), level: 'confirm' },
    ],
  },
  {
    category: t('Notes'),
    icon: StickyNote,
    color: 'text-amber-600 bg-amber-50',
    tools: [
      { name: 'add_note', desc: t('Ajouter une note'), level: 'confirm' },
    ],
  },
  {
    category: t('Push CV'),
    icon: Send,
    color: 'text-teal-600 bg-teal-50',
    tools: [
      { name: 'create_push', desc: t('Creer un push CV'), level: 'confirm' },
      { name: 'list_pushes', desc: t('Lister les pushes'), level: 'free' },
      { name: 'update_push_status', desc: t('Changer statut push'), level: 'confirm' },
      { name: 'get_push_stats', desc: t('Stats push equipe'), level: 'admin' },
    ],
  },
];

const EXAMPLES = [
  { prompt: t('Montre-moi mes mandats en cours'), desc: t('Cherche vos mandats actifs') },
  { prompt: t('Trouve-moi des devs React sur Paris'), desc: t('Recherche dans le vivier') },
  { prompt: t("C'est quoi la fiche de Jean Dupont ?"), desc: t('Affiche la fiche complete') },
  { prompt: t('Ajoute une note : Entretien positif, a rappeler'), desc: t('Cree une note sur la fiche') },
  { prompt: t('Cree une tache pour relancer Dupont lundi'), desc: t('Cree la tache avec la date') },
  { prompt: t('Mon brief du jour'), desc: t('Stats, RDV, taches urgentes, alertes') },
  { prompt: t('Passe Durand en ENTRETIEN_CLIENT'), desc: t('Deplace dans le pipeline') },
  { prompt: t('Mes stats de la semaine'), desc: t('Appels, RDV, candidats, CA') },
];

const WORKFLOWS = [
  {
    title: t('Sourcing rapide'),
    steps: [
      { role: 'user', text: t('Trouve-moi des profils Product Manager sur Paris') },
      { role: 'claude', text: t("J'ai trouve 8 candidats PM a Paris :\n1. Marie Leclerc — PM Senior chez Doctolib — 65k\n2. Thomas Petit — PM chez BlaBlaCar — 58k\n...") },
      { role: 'user', text: t('Ajoute Marie et Thomas au mandat "PM Senior Acme"') },
      { role: 'claude', text: t("Je vais ajouter ces 2 candidats en etape SOURCING.\nTu confirmes ?") },
      { role: 'user', text: t('Oui') },
      { role: 'claude', text: t('Les 2 candidats ont ete ajoutes au pipeline.') },
    ],
  },
  {
    title: t('Brief matinal'),
    steps: [
      { role: 'user', text: t("C'est quoi mon programme aujourd'hui ?") },
      { role: 'claude', text: t("Voici ton brief du jour :\n- 3 RDV (9h client Moreau, 14h entretien, 16h call equipe)\n- 2 taches en retard\n- 12 candidats en cours sur 4 mandats\n- 3 nouveaux emails") },
    ],
  },
  {
    title: t('Suivi pipeline'),
    steps: [
      { role: 'user', text: t('Ou en est le mandat Dev Full Stack chez Acme ?') },
      { role: 'claude', text: t("Mandat \"Dev Full Stack\" — Acme Corp\nStatut : EN_COURS | Fee : 18%\n\nSOURCING (3) : Dupont, Martin, Leroy\nCONTACTE (2) : Blanc, Moreau\nENTRETIEN_1 (1) : Durand") },
      { role: 'user', text: t('Passe Durand en ENTRETIEN_CLIENT') },
      { role: 'claude', text: t("Je deplace Sophie Durand vers ENTRETIEN_CLIENT.\nTu confirmes ?") },
      { role: 'user', text: t('Oui') },
      { role: 'claude', text: t('Sophie Durand est maintenant en ENTRETIEN_CLIENT.') },
    ],
  },
  {
    title: t('Push CV'),
    steps: [
      { role: 'user', text: t('Push le CV de Marie Leclerc a TotalEnergies, contact Pierre Blanc, par email') },
      { role: 'claude', text: t("Je vais creer ce push CV :\n- Candidat : Marie Leclerc\n- Prospect : TotalEnergies (Pierre Blanc)\n- Canal : EMAIL\nTu confirmes ?") },
      { role: 'user', text: t('Oui') },
      { role: 'claude', text: t('Push cree. Une tache de relance a 48h a ete creee automatiquement.') },
    ],
  },
];

const MCP_CONFIG = `{
  "mcpServers": {
    "humanup": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://ats.propium.co/mcp",
        "--allow-http"
      ]
    }
  }
}`;

// ─── COMPONENTS ────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  if (level === 'free') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <CheckCircle2 className="w-3 h-3" /> {t('Libre')}
    </span>
  );
  if (level === 'confirm') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <AlertTriangle className="w-3 h-3" /> {t('Confirmation')}
    </span>
  );
  if (level === 'admin') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
      <Shield className="w-3 h-3" /> {t('Admin')}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> {t('Bloque')}
    </span>
  );
}

function ToolCategory({ category }: { category: typeof TOOLS[number] }) {
  const [open, setOpen] = useState(false);
  const Icon = category.icon;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${category.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-semibold text-gray-900">{category.category}</span>
          <span className="text-sm text-gray-500">({t(category.tools.length > 1 ? '{n} outils' : '{n} outil', { n: category.tools.length })})</span>
        </div>
        {open ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {category.tools.map((tool) => (
            <div key={tool.name} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
              <div>
                <code className="text-sm font-mono text-gray-700">{tool.name}</code>
                <p className="text-sm text-gray-500 mt-0.5">{tool.desc}</p>
              </div>
              <LevelBadge level={tool.level} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors">
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
    </button>
  );
}

function WorkflowCard({ workflow }: { workflow: typeof WORKFLOWS[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900">{workflow.title}</span>
        {open ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          {workflow.steps.map((step, i) => (
            <div key={i} className={`flex gap-3 ${step.role === 'claude' ? '' : ''}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step.role === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {step.role === 'user' ? t('Toi') : t('AI')}
              </div>
              <div className={`flex-1 rounded-xl px-4 py-3 text-sm whitespace-pre-line ${
                step.role === 'user' ? 'bg-blue-50 text-blue-900' : 'bg-gray-50 text-gray-800'
              }`}>
                {step.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────

export default function DocsMcpPage() {
  const [search, setSearch] = useState('');

  const filteredTools = search
    ? TOOLS.map(cat => ({
        ...cat,
        tools: cat.tools.filter(t =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.desc.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(cat => cat.tools.length > 0)
    : TOOLS;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 text-white">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Guide MCP HumanUp')}</h1>
          </div>
          <p className="text-gray-600">{t("Pilotez l'ATS en langage naturel depuis Claude Desktop")}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-16">
        {/* Intro */}
        <section>
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-2xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              {t("C'est quoi le MCP ?")}
            </h2>
            <p className="text-gray-700 leading-relaxed">
              {t('Le MCP (Model Context Protocol) connecte')} <strong>{t("Claude directement a l'ATS HumanUp")}</strong>.{' '}
              {t('Vous pouvez parler a Claude en langage naturel et il va chercher, creer, modifier vos donnees — candidats, clients, mandats, taches, emails, stats — sans quitter la conversation.')}
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-purple-700">
              <Zap className="w-4 h-4" />
              <span>{t("Au lieu de naviguer dans l'interface web, vous le demandez a Claude et il le fait pour vous.")}</span>
            </div>
          </div>
        </section>

        {/* Installation */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-600" />
            {t('Installation (5 minutes)')}
          </h2>

          <div className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">1</div>
              <div>
                <h3 className="font-semibold text-gray-900">{t('Installer Claude Desktop')}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t('Telechargez depuis')}{' '}
                  <a href="https://claude.ai/download" target="_blank" rel="noopener" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                    claude.ai/download <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}{t('et connectez-vous avec votre compte Anthropic.')}
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">2</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{t('Configurer la connexion MCP')}</h3>
                <p className="text-sm text-gray-600 mt-1 mb-3">
                  {t('Ouvrez le fichier de configuration Claude Desktop :')}
                </p>
                <div className="text-sm space-y-1 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{t('Windows :')}</span>
                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">%APPDATA%\Claude\claude_desktop_config.json</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{t('Mac :')}</span>
                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</code>
                  </div>
                </div>
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 rounded-xl p-5 text-sm overflow-x-auto font-mono">
                    {MCP_CONFIG}
                  </pre>
                  <CopyButton text={MCP_CONFIG} />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">3</div>
              <div>
                <h3 className="font-semibold text-gray-900">{t('Premiere connexion')}</h3>
                <ol className="text-sm text-gray-600 mt-2 space-y-1 list-decimal list-inside">
                  <li>{t('Redemarrez Claude Desktop')}</li>
                  <li>{t('Claude ouvre une page de connexion dans votre navigateur')}</li>
                  <li>{t('Connectez-vous avec')} <strong>{t('vos identifiants HumanUp')}</strong> {t('(email + mot de passe)')}</li>
                  <li>{t("Revenez dans Claude Desktop — c'est pret !")}</li>
                </ol>
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  {t("Vous devriez voir une icone d'outils (marteau) en bas de la fenetre de chat avec le nombre d'outils disponibles.")}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comment ca marche */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            {t('Comment ca marche ?')}
          </h2>

          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              {t('Pas besoin de commandes speciales. Parlez a Claude comme a un collegue :')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EXAMPLES.map((ex, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                  <p className="text-sm font-medium text-gray-900">"{ex.prompt}"</p>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> {ex.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t("Confirmation avant d'ecrire")}
            </h3>
            <p className="text-sm text-amber-800">
              {t('Pour toutes les actions qui')} <strong>{t('modifient')}</strong> {t('des donnees (creer, modifier, supprimer), Claude vous demandera')}{' '}
              <strong>{t('toujours confirmation')}</strong> {t("avant d'agir. Il vous montrera un resume de ce qu'il s'apprete a faire.")}
            </p>
          </div>
        </section>

        {/* Workflows */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            {t('Exemples de workflows')}
          </h2>
          <div className="space-y-3">
            {WORKFLOWS.map((wf) => (
              <WorkflowCard key={wf.title} workflow={wf} />
            ))}
          </div>
        </section>

        {/* Tools reference */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Search className="w-5 h-5 text-gray-500" />
            {t('Tous les outils ({n})', { n: TOOLS.reduce((n, c) => n + c.tools.length, 0) })}
          </h2>
          <p className="text-sm text-gray-500 mb-4">{t('Cliquez sur une categorie pour voir les outils disponibles.')}</p>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            <LevelBadge level="free" />
            <span className="text-xs text-gray-500">= {t('acces direct')}</span>
            <LevelBadge level="confirm" />
            <span className="text-xs text-gray-500">= {t('confirmation requise')}</span>
            <LevelBadge level="admin" />
            <span className="text-xs text-gray-500">= {t('admin uniquement')}</span>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Filtrer les outils...')}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-3">
            {filteredTools.map((cat) => (
              <ToolCategory key={cat.category} category={cat} />
            ))}
          </div>
        </section>

        {/* Security */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            {t('Securite')}
          </h2>
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <h3 className="font-semibold text-red-900 mb-3">{t('Actions bloquees par securite')}</h3>
            <p className="text-sm text-red-800 mb-3">
              {t('Ces actions sont')} <strong>{t('interdites')}</strong> {t("via MCP. Utilisez l'interface web pour :")}
            </p>
            <ul className="text-sm text-red-800 space-y-1">
              <li className="flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {t('Supprimer un client, un mandat ou une entreprise')}</li>
              <li className="flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {t('Exporter la base de donnees')}</li>
              <li className="flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {t('Modifier les parametres systeme')}</li>
            </ul>
          </div>
        </section>

        {/* Tips */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            {t('Astuces')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { tip: t('Pas besoin d\'UUID'), detail: t('Dites le nom du candidat/client, Claude le trouvera tout seul') },
              { tip: t('Combinez les actions'), detail: t('"Cree un candidat et ajoute-le au mandat Acme" fonctionne') },
              { tip: t('Detection des doublons'), detail: t('Si le candidat existe deja (meme nom ou email), Claude vous previent') },
              { tip: t('Brief chaque matin'), detail: t('"Mon brief du jour" est le meilleur moyen de demarrer la journee') },
            ].map((tp, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                <h4 className="font-semibold text-gray-900 text-sm">{tp.tip}</h4>
                <p className="text-xs text-gray-500 mt-1">{tp.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Troubleshooting */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {t('Depannage')}
          </h2>
          <div className="space-y-4">
            {[
              { q: t('Les outils ne s\'affichent pas'), a: t('Redemarrez completement Claude Desktop (quitter l\'app, pas juste fermer la fenetre).') },
              { q: t('Erreur d\'authentification'), a: t('Verifiez la config claude_desktop_config.json, redemarrez Claude Desktop, et reconnectez-vous avec vos identifiants HumanUp.') },
              { q: t('Session expiree'), a: t('Redemarrez Claude Desktop — une nouvelle session OAuth sera creee automatiquement.') },
              { q: t('Action bloquee ou outil non trouve'), a: t('Certaines actions sont reservees aux admins ou bloquees par securite. Verifiez votre role.') },
            ].map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-5">
                <h4 className="font-semibold text-gray-900 text-sm">{faq.q}</h4>
                <p className="text-sm text-gray-600 mt-1">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-gray-500">
          {t('HumanUp.io — ATS intelligent pour les cabinets de recrutement')}
        </div>
      </footer>
    </div>
  );
}
