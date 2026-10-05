import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import PortalMandatPage from './mandat';

const candidature = {
  id: 'c1', stage: 'PROCESS', column: 'CASE', dateEntretienClient: null, seen: true,
  candidat: { id: 'k1', nom: 'Ayoub', prenom: 'Sara', posteActuel: null, entrepriseActuelle: null, salaireSouhaite: null, photoUrl: null, aiPitchShort: null, aiAnonymizedProfile: null },
  portalDecisions: [], _count: { portalComments: 0 },
};
const kanban = {
  mandat: {
    id: 'm1', titrePoste: 'Senior Account Manager', visibleStages: [], entreprise: { nom: 'Tenacy' },
    client: { nom: 'Natier', prenom: 'Mathilde' }, consultant: { nom: 'Nguimbi', prenom: 'Méroë' }, commercial: null,
  },
  stages: ['INBOX', 'SCREENING', 'CASE', 'CULTURE_FIT', 'OFFRE', 'ENGAGE', 'PERDU'],
  byStage: { INBOX: [], SCREENING: [], CASE: [candidature], CULTURE_FIT: [], OFFRE: [], ENGAGE: [], PERDU: [] },
};

const posted: Array<{ url: string; body: any }> = [];
function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}
function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (init?.method === 'POST') {
    posted.push({ url, body: JSON.parse(String(init.body ?? '{}')) });
    return json({ ok: true });
  }
  if (url.includes('/kanban')) return json(kanban);
  if (url.includes('/mentionables')) return json({ internal: [], external: [] });
  if (url.includes('/me')) return json({ email: 'mathilde@tenacy.io', name: 'Mathilde', offres: [] });
  if (url.includes('/notifications')) return json({ items: [], unseen: 0 });
  return json([]);
}

function ouvrirFicheCommentaires() {
  return render(
    <MemoryRouter initialEntries={['/portail/mandat/m1?c=c1&t=commentaires']}>
      <Routes>
        <Route path="/portail/mandat/:mandatId" element={<PortalMandatPage />} />
        <Route path="*" element={<div>ailleurs</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Portail client : brouillon de commentaire', () => {
  beforeEach(() => {
    cleanup();
    posted.length = 0;
    localStorage.clear();
    localStorage.setItem('portal_token', 'jeton-de-test');
    vi.stubGlobal('fetch', vi.fn(mockFetch));
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  });

  it('prévient à la fermeture, garde le brouillon, puis l’envoie', async () => {
    const user = userEvent.setup();
    ouvrirFicheCommentaires();

    // Le client écrit un commentaire sans cliquer sur Envoyer…
    const champ = await screen.findByLabelText('Écrire un commentaire');
    await user.type(champ, 'Très bon entretien, on avance');

    // …puis ferme la fiche : il est prévenu, rien n'est perdu.
    await user.click(screen.getByRole('button', { name: 'Fermer le dossier' }));
    expect(await screen.findByText('Commentaire non envoyé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByLabelText('Écrire un commentaire')).not.toBeInTheDocument());
    expect(posted.filter((p) => p.url.endsWith('/comment'))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('portal_draft_c1') || '{}').text).toBe('Très bon entretien, on avance');

    // À la réouverture, le texte est là et signalé comme brouillon.
    cleanup();
    ouvrirFicheCommentaires();
    const champ2 = await screen.findByLabelText('Écrire un commentaire');
    expect(champ2).toHaveValue('Très bon entretien, on avance');
    expect(screen.getByText('Brouillon non envoyé')).toBeInTheDocument();

    // L'envoi part et vide le brouillon.
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(posted.filter((p) => p.url.endsWith('/comment'))).toHaveLength(1));
    expect(posted.find((p) => p.url.endsWith('/comment'))?.body.content).toBe('Très bon entretien, on avance');
    await waitFor(() => expect(localStorage.getItem('portal_draft_c1')).toBeNull());
  });

  it('ferme sans avertissement quand rien n’est écrit', async () => {
    const user = userEvent.setup();
    ouvrirFicheCommentaires();
    await screen.findByLabelText('Écrire un commentaire');
    await user.click(screen.getByRole('button', { name: 'Fermer le dossier' }));
    await waitFor(() => expect(screen.queryByLabelText('Écrire un commentaire')).not.toBeInTheDocument());
    expect(screen.queryByText('Commentaire non envoyé')).not.toBeInTheDocument();
  });

  it('« Revenir au commentaire » rouvre le champ avec le texte', async () => {
    const user = userEvent.setup();
    ouvrirFicheCommentaires();
    await user.type(await screen.findByLabelText('Écrire un commentaire'), 'À revoir ensemble');
    await user.click(screen.getByRole('button', { name: 'Fermer le dossier' }));
    await user.click(await screen.findByRole('button', { name: 'Revenir au commentaire' }));
    expect(screen.queryByText('Commentaire non envoyé')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Écrire un commentaire')).toHaveValue('À revoir ensemble');
  });
});
