import { useEffect, useState, useCallback } from 'react';
import {
  isAuthenticated,
  login,
  logout,
  createCandidat,
  createClient,
  createEntreprise,
  createCandidature,
  createExperiences,
  fetchEntreprises,
  fetchMandats,
  type Entreprise,
  type Mandat,
  type CreateCandidatPayload,
  type CreateClientPayload,
  type CreateEntreprisePayload,
  type CreateExperiencePayload,
} from './api';

// ---------- Types ----------

interface ExperienceData {
  titre: string;
  entreprise: string;
  anneeDebut: number | null;
  anneeFin: number | null;
}

interface PersonData {
  type: 'person';
  prenom: string;
  nom: string;
  poste: string;
  entreprise: string;
  localisation: string;
  linkedinUrl: string;
  photoUrl: string;
  experiences: ExperienceData[];
}

interface CompanyData {
  type: 'company';
  nom: string;
  secteur: string;
  taille: string;
  localisation: string;
  linkedinUrl: string;
  siteWeb: string;
}

type PageData = PersonData | CompanyData | { type: 'unknown' };

// ---------- Spinner ----------

function Spinner() {
  return <div className="loading-spinner" />;
}

// ---------- App ----------

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = loading
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    isAuthenticated()
      .then(setAuthed)
      .catch(() => setAuthed(false));
  }, []);

  // Fetch page data from content script when authenticated
  const loadPageData = useCallback(() => {
    setPageError(null);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        setPageData({ type: 'unknown' });
        return;
      }

      // Check if we're on LinkedIn
      if (!tab.url?.includes('linkedin.com')) {
        setPageData({ type: 'unknown' });
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { type: 'GET_PAGE_DATA' },
        (response: PageData | undefined) => {
          if (chrome.runtime.lastError) {
            // Content script not loaded yet - try injecting it
            setPageError(
              'Impossible de lire la page. Rechargez la page LinkedIn et r\u00e9essayez.'
            );
            setPageData({ type: 'unknown' });
          } else if (!response) {
            setPageData({ type: 'unknown' });
          } else {
            setPageData(response);
          }
        }
      );
    });
  }, []);

  useEffect(() => {
    if (authed) {
      loadPageData();
    }
  }, [authed, loadPageData]);

  const handleLogin = () => setAuthed(true);
  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    setPageData(null);
    setPageError(null);
  };

  // Loading state
  if (authed === null) {
    return (
      <div className="loading">
        <Spinner />
        Chargement...
      </div>
    );
  }

  // Not authenticated
  if (!authed) {
    return <LoginView onSuccess={handleLogin} />;
  }

  // Authenticated -- show header + content
  return (
    <div>
      <header className="header">
        <h1>HumanUp ATS</h1>
        <div className="header-actions">
          <button className="btn-logout" onClick={handleLogout}>
            D&eacute;connexion
          </button>
        </div>
      </header>

      {pageError && (
        <div style={{ padding: '12px 18px 0' }}>
          <div className="error-msg">{pageError}</div>
        </div>
      )}

      {!pageData ? (
        <div className="loading">
          <Spinner />
          Lecture de la page...
        </div>
      ) : pageData.type === 'person' ? (
        <ProfileView data={pageData} />
      ) : pageData.type === 'company' ? (
        <CompanyView data={pageData} />
      ) : (
        <UnknownPageView onRetry={loadPageData} />
      )}
    </div>
  );
}

// ---------- Login View ----------

function LoginView({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Failed to fetch') {
          setError(
            'Impossible de joindre le serveur. V\u00e9rifiez que l\u2019API est d\u00e9marr\u00e9e.'
          );
        } else {
          setError(err.message);
        }
      } else {
        setError('Erreur de connexion');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="header">
        <h1>HumanUp ATS</h1>
      </header>
      <form className="login-form" onSubmit={handleSubmit}>
        <h2>Connexion</h2>
        <p>
          Connectez-vous pour ajouter des candidats et entreprises depuis
          LinkedIn.
        </p>

        {error && <div className="error-msg">{error}</div>}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@entreprise.com"
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Votre mot de passe"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner /> Connexion...
            </>
          ) : (
            'Se connecter'
          )}
        </button>
      </form>
    </div>
  );
}

// ---------- Profile View (Person) ----------

function ProfileView({ data }: { data: PersonData }) {
  const [nom, setNom] = useState(data.nom);
  const [prenom, setPrenom] = useState(data.prenom);
  const [poste, setPoste] = useState(data.poste);
  const [entreprise, setEntreprise] = useState(data.entreprise);
  const [localisation, setLocalisation] = useState(data.localisation);
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  // Mandat selector (for candidat mode)
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [mandatsLoading, setMandatsLoading] = useState(false);
  const [selectedMandatId, setSelectedMandatId] = useState('');
  const [selectedStage, setSelectedStage] = useState('SOURCING');

  // Client-specific
  const [mode, setMode] = useState<'candidat' | 'client' | null>(null);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [entreprisesLoading, setEntreprisesLoading] = useState(false);
  const [selectedEntrepriseId, setSelectedEntrepriseId] = useState('');
  const [showNewEntreprise, setShowNewEntreprise] = useState(false);
  const [newEntrepriseNom, setNewEntrepriseNom] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ type: string; id: string; updated?: boolean; mandatId?: string } | null>(
    null
  );

  // Load mandats on mount (for candidat mandat selector)
  useEffect(() => {
    setMandatsLoading(true);
    fetchMandats()
      .then(setMandats)
      .catch(() => setMandats([]))
      .finally(() => setMandatsLoading(false));
  }, []);

  // Load entreprises when switching to client mode
  useEffect(() => {
    if (mode === 'client') {
      setEntreprisesLoading(true);
      fetchEntreprises()
        .then(setEntreprises)
        .catch(() => setEntreprises([]))
        .finally(() => setEntreprisesLoading(false));
    }
  }, [mode]);

  const handleCreateNewEntreprise = async () => {
    if (!newEntrepriseNom.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await createEntreprise({ nom: newEntrepriseNom.trim() });
      setEntreprises((prev) => [
        ...prev,
        { id: result.id, nom: newEntrepriseNom.trim() },
      ]);
      setSelectedEntrepriseId(result.id);
      setShowNewEntreprise(false);
      setNewEntrepriseNom('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la cr\u00e9ation de l\u2019entreprise'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCandidat = async () => {
    setError('');
    setLoading(true);
    try {
      const payload: CreateCandidatPayload = {
        nom: nom.trim(),
        prenom: prenom.trim() || undefined,
        email: email.trim() || undefined,
        telephone: telephone.trim() || undefined,
        linkedinUrl: data.linkedinUrl,
        photoUrl: data.photoUrl || undefined,
        posteActuel: poste.trim() || undefined,
        entrepriseActuelle: entreprise.trim() || undefined,
        localisation: localisation.trim() || undefined,
        source: 'LinkedIn',
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const result = await createCandidat(payload);

      // If a mandat is selected, also create the candidature
      if (selectedMandatId) {
        try {
          await createCandidature({
            candidatId: result.id,
            mandatId: selectedMandatId,
            stage: selectedStage,
          });
        } catch (candidatureErr) {
          // Show error unless it's a duplicate (which is ok)
          const msg = candidatureErr instanceof Error ? candidatureErr.message : '';
          if (!msg.includes('deja associe') && !msg.includes('already')) {
            setError(`Candidat créé, mais erreur pipeline : ${msg || 'Erreur inconnue'}`);
            setSuccess({ type: 'candidat', id: result.id, updated: result._updated });
            return;
          }
        }
      }

      // Create experiences from LinkedIn profile
      if (data.experiences && data.experiences.length > 0) {
        const validExps: CreateExperiencePayload[] = data.experiences
          .filter((exp) => exp.titre && exp.entreprise && exp.anneeDebut)
          .map((exp) => ({
            titre: exp.titre,
            entreprise: exp.entreprise,
            anneeDebut: exp.anneeDebut!,
            anneeFin: exp.anneeFin,
          }));
        if (validExps.length > 0) {
          await createExperiences(result.id, validExps);
        }
      }

      setSuccess({ type: 'candidat', id: result.id, updated: result._updated, mandatId: selectedMandatId || undefined });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Failed to fetch') {
          setError(
            'Impossible de joindre le serveur. V\u00e9rifiez que l\u2019API est d\u00e9marr\u00e9e.'
          );
        } else if (err.message === 'NOT_AUTHENTICATED') {
          setError('Session expir\u00e9e. Veuillez vous reconnecter.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Erreur lors de la cr\u00e9ation du candidat');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitClient = async () => {
    if (!selectedEntrepriseId) {
      setError('Veuillez s\u00e9lectionner une entreprise');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const payload: CreateClientPayload = {
        nom: nom.trim(),
        prenom: prenom.trim() || undefined,
        email: email.trim() || undefined,
        telephone: telephone.trim() || undefined,
        poste: poste.trim() || undefined,
        linkedinUrl: data.linkedinUrl,
        entrepriseId: selectedEntrepriseId,
        notes: notes.trim() || undefined,
      };
      const result = await createClient(payload);
      setSuccess({ type: 'client', id: result.id });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Failed to fetch') {
          setError(
            'Impossible de joindre le serveur. V\u00e9rifiez que l\u2019API est d\u00e9marr\u00e9e.'
          );
        } else if (err.message === 'NOT_AUTHENTICATED') {
          setError('Session expir\u00e9e. Veuillez vous reconnecter.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Erreur lors de la cr\u00e9ation du client');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const label = success.type === 'candidat' ? 'Candidat' : 'Client';
    const actionLabel = success.updated ? 'mis \u00e0 jour' : 'ajout\u00e9';
    const mandatLabel = success.mandatId
      ? mandats.find((m) => m.id === success.mandatId)
      : null;
    return (
      <div className="success-card">
        <div className="success-icon">{'\u2713'}</div>
        <h3>{label} {actionLabel} !</h3>
        <p>
          {prenom} {nom} a \u00e9t\u00e9 {actionLabel}(e) comme{' '}
          {label.toLowerCase()}.
        </p>
        {mandatLabel && (
          <p style={{ fontSize: '12px', color: '#6B7194', marginTop: '4px' }}>
            Ajout\u00e9(e) au pipeline : <strong>{mandatLabel.titrePoste}</strong>
          </p>
        )}
        <a
          href={`https://ats.propium.co/${
            success.type === 'candidat' ? 'candidats' : 'clients'
          }/${success.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir la fiche dans HumanUp {'\u2192'}
        </a>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="section-title">Profil LinkedIn</div>
      <div className="profile-header">
        {data.photoUrl && (
          <img
            src={data.photoUrl}
            alt={`${prenom} ${nom}`}
            className="profile-photo"
          />
        )}
        <div className="linkedin-badge">
          {'\uD83D\uDD17'} {data.linkedinUrl.split('/in/')[1]?.replace(/\/$/, '') || 'profil'}
        </div>
      </div>

      <div className="profile-form">
        <div className="form-row">
          <div className="form-group">
            <label>Pr\u00e9nom</label>
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Nom</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Poste actuel</label>
          <input value={poste} onChange={(e) => setPoste(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Entreprise</label>
          <input
            value={entreprise}
            onChange={(e) => setEntreprise(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Localisation</label>
          <input
            value={localisation}
            onChange={(e) => setLocalisation(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="optionnel"
            />
          </div>
          <div className="form-group">
            <label>T\u00e9l\u00e9phone</label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="optionnel"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Tags (s\u00e9par\u00e9s par des virgules)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ex : frontend, senior, react"
          />
        </div>

        {/* Experiences preview */}
        {data.experiences && data.experiences.length > 0 && mode !== 'client' && (
          <div className="form-group">
            <label>Parcours ({data.experiences.length} exp\u00e9riences d\u00e9tect\u00e9es)</label>
            <div style={{ fontSize: '11px', color: '#6B7194', maxHeight: '100px', overflowY: 'auto', background: '#F8F8FC', borderRadius: '6px', padding: '6px 8px' }}>
              {data.experiences.slice(0, 5).map((exp, i) => (
                <div key={i} style={{ marginBottom: '3px' }}>
                  <strong>{exp.titre}</strong> {exp.entreprise ? `\u2014 ${exp.entreprise}` : ''}
                  {exp.anneeDebut ? ` (${exp.anneeDebut}${exp.anneeFin ? `-${exp.anneeFin}` : '-...'})` : ''}
                </div>
              ))}
              {data.experiences.length > 5 && (
                <div style={{ fontStyle: 'italic' }}>+ {data.experiences.length - 5} autres...</div>
              )}
            </div>
          </div>
        )}

        {/* Mandat selector (visible in default/candidat mode) */}
        {mode !== 'client' && (
          <>
          <div className="form-group">
            <label>Associer \u00e0 un mandat (optionnel)</label>
            {mandatsLoading ? (
              <div style={{ padding: '8px', color: '#6B7194', fontSize: '12px' }}>
                Chargement des mandats...
              </div>
            ) : (
              <select
                value={selectedMandatId}
                onChange={(e) => setSelectedMandatId(e.target.value)}
              >
                <option value="">-- Aucun mandat --</option>
                {mandats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titrePoste}{m.entreprise ? ` — ${m.entreprise.nom}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

            {/* Stage selector — shown when a mandat is selected */}
            {selectedMandatId && (
              <div className="form-group">
                <label>{'\u00c9'}tape du pipeline</label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                >
                  <option value="SOURCING">Sourcing</option>
                  <option value="CONTACTE">Contact{'\u00e9'}</option>
                  <option value="ENTRETIEN_1">Entretien 1</option>
                  <option value="ENTRETIEN_CLIENT">Entretien Client</option>
                  <option value="OFFRE">Offre</option>
                  <option value="PLACE">Plac{'\u00e9'}</option>
                </select>
              </div>
            )}
          </>
        )}

        {/* Client mode: entreprise selector */}
        {mode === 'client' && (
          <>
            <div className="form-group">
              <label>Entreprise du client</label>
              {entreprisesLoading ? (
                <div
                  style={{
                    padding: '8px',
                    color: '#6B7194',
                    fontSize: '12px',
                  }}
                >
                  Chargement des entreprises...
                </div>
              ) : (
                <select
                  value={selectedEntrepriseId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setShowNewEntreprise(true);
                      setSelectedEntrepriseId('');
                    } else {
                      setShowNewEntreprise(false);
                      setSelectedEntrepriseId(e.target.value);
                    }
                  }}
                >
                  <option value="">-- S\u00e9lectionner --</option>
                  {entreprises.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.nom}
                    </option>
                  ))}
                  <option value="__new__">
                    + Cr\u00e9er nouvelle entreprise
                  </option>
                </select>
              )}
            </div>

            {showNewEntreprise && (
              <div className="inline-new">
                <div className="inline-new-row">
                  <input
                    value={newEntrepriseNom}
                    onChange={(e) => setNewEntrepriseNom(e.target.value)}
                    placeholder="Nom de l'entreprise"
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateNewEntreprise}
                    disabled={loading || !newEntrepriseNom.trim()}
                  >
                    {loading ? '...' : 'Cr\u00e9er'}
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes sur le client..."
              />
            </div>
          </>
        )}

        {error && <div className="error-msg">{error}</div>}

        {mode === null ? (
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() => {
                setMode('candidat');
                handleSubmitCandidat();
              }}
              disabled={loading || !nom.trim()}
            >
              {loading ? (
                <>
                  <Spinner /> ...
                </>
              ) : (
                'Ajouter comme Candidat'
              )}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setMode('client')}
              disabled={loading}
            >
              Ajouter comme Client
            </button>
          </div>
        ) : mode === 'client' ? (
          <div className="btn-row">
            <button
              className="btn btn-outline"
              onClick={() => {
                setMode(null);
                setError('');
              }}
            >
              Retour
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmitClient}
              disabled={loading || !nom.trim() || !selectedEntrepriseId}
            >
              {loading ? (
                <>
                  <Spinner /> ...
                </>
              ) : (
                'Ajouter comme Client'
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Company View ----------

function CompanyView({ data }: { data: CompanyData }) {
  const [nom, setNom] = useState(data.nom);
  const [secteur, setSecteur] = useState(data.secteur);
  const [taille, setTaille] = useState(data.taille);
  const [localisation, setLocalisation] = useState(data.localisation);
  const [siteWeb, setSiteWeb] = useState(data.siteWeb);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const payload: CreateEntreprisePayload = {
        nom: nom.trim(),
        secteur: secteur.trim() || undefined,
        siteWeb: siteWeb.trim() || undefined,
        taille: mapTaille(taille),
        localisation: localisation.trim() || undefined,
        linkedinUrl: data.linkedinUrl,
        notes: notes.trim() || undefined,
      };
      const result = await createEntreprise(payload);
      setSuccess(result.id);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Failed to fetch') {
          setError(
            'Impossible de joindre le serveur. V\u00e9rifiez que l\u2019API est d\u00e9marr\u00e9e.'
          );
        } else if (err.message === 'NOT_AUTHENTICATED') {
          setError('Session expir\u00e9e. Veuillez vous reconnecter.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Erreur lors de la cr\u00e9ation de l\u2019entreprise');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="success-card">
        <div className="success-icon">{'\u2713'}</div>
        <h3>Entreprise ajout\u00e9e !</h3>
        <p>{nom} a \u00e9t\u00e9 ajout\u00e9e au CRM.</p>
        <a
          href={`https://ats.propium.co/entreprises/${success}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir la fiche dans HumanUp {'\u2192'}
        </a>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="section-title">Page Entreprise LinkedIn</div>
      <div className="linkedin-badge">
        {'\uD83C\uDFE2'}{' '}
        {data.linkedinUrl.split('/company/')[1]?.replace(/\/$/, '') || 'entreprise'}
      </div>

      <div className="profile-form">
        <div className="form-group">
          <label>Nom</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Secteur</label>
            <input
              value={secteur}
              onChange={(e) => setSecteur(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Taille</label>
            <select value={taille} onChange={(e) => setTaille(e.target.value)}>
              <option value="">-- Optionnel --</option>
              <option value="STARTUP">Startup (1-10)</option>
              <option value="PME">PME (11-200)</option>
              <option value="ETI">ETI (201-1000)</option>
              <option value="GRAND_GROUPE">Grand Groupe (1000+)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Localisation</label>
          <input
            value={localisation}
            onChange={(e) => setLocalisation(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Site web</label>
          <input
            value={siteWeb}
            onChange={(e) => setSiteWeb(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes sur l'entreprise..."
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button
          className="btn btn-primary btn-block"
          onClick={handleSubmit}
          disabled={loading || !nom.trim()}
        >
          {loading ? (
            <>
              <Spinner /> Enregistrement...
            </>
          ) : (
            'Ajouter entreprise'
          )}
        </button>
      </div>
    </div>
  );
}

// ---------- Unknown Page View ----------

function UnknownPageView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="unknown-page">
      <div className="unknown-page-icon">{'\uD83D\uDD0D'}</div>
      <p>
        Naviguez vers un <strong>profil LinkedIn</strong>
        <br />
        ou une <strong>page entreprise</strong> pour
        <br />
        extraire les informations.
      </p>
      <div style={{ marginTop: '16px' }}>
        <button className="btn btn-outline" onClick={onRetry}>
          R\u00e9essayer la lecture
        </button>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function mapTaille(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  if (
    lower.includes('1-10') ||
    lower.includes('startup') ||
    lower.includes('1 -') ||
    lower.includes('2-10')
  )
    return 'STARTUP';
  if (
    lower.includes('11-50') ||
    lower.includes('51-200') ||
    lower.includes('pme')
  )
    return 'PME';
  if (
    lower.includes('201-') ||
    lower.includes('501-') ||
    lower.includes('eti') ||
    lower.includes('201-500') ||
    lower.includes('501-1000') ||
    lower.includes('501-1,000')
  )
    return 'ETI';
  if (
    lower.includes('1001') ||
    lower.includes('1,001') ||
    lower.includes('5001') ||
    lower.includes('5,001') ||
    lower.includes('10,001') ||
    lower.includes('10001') ||
    lower.includes('grand') ||
    lower.includes('1,001-5,000') ||
    lower.includes('5,001-10,000') ||
    lower.includes('10,001+')
  )
    return 'GRAND_GROUPE';
  // Check if it's already a valid enum value
  const valid = ['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE'];
  if (valid.includes(raw)) return raw;
  return undefined;
}
