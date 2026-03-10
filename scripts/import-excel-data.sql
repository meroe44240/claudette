-- ============================================================
-- Import ATS_Humanup_Mandats.xlsx data into HumanUp ATS
-- ============================================================

BEGIN;

-- ── ENTREPRISES ─────────────────────────────────────────────

INSERT INTO entreprises (id, nom, secteur, localisation, notes, taille, "createdById", "createdAt", "updatedAt") VALUES
  ('e0000001-0000-0000-0000-000000000001', 'Joy/Privateaser', 'SaaS CHR', 'Paris 9ème', 'Éditeur SaaS vertical leader CHR (restauration, bars, événementiel). 7-8M€ ARR, 2 000+ clients. Fonds au capital.', 'PME', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000002', 'Groupe SENEF', 'SaaS Vertical (ERP métiers)', 'Neuilly-sur-Seine', 'Éditeur ERP 100% web pour entreprises de services. 10M€ ARR, 50-99 salariés. Progisap, Progiclean, Seenet. Fondé 2011. Isatis Capital au capital. Earn-out 2027.', 'PME', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000003', 'Temelion', 'ConstructionTech / IA', 'Station F (Paris) + Toulouse', 'Plateforme IA d''analyse documentaire pour BET. Early-stage, 10 clients, 3,2M€ levés. 360 Capital (lead), ISAI, SE Ventures, Kima Ventures. Fondée 2025.', 'STARTUP', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000004', 'Smaart Consulting', 'Marketing Automation / ESN', NULL, 'ESN spécialisée Marketing Automation fondée par Houda.', 'STARTUP', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000005', 'Crystal Placement', 'Conseil / ESN', 'Maroc', 'Cabinet / ESN. Client Brahim El Mejri.', 'PME', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000006', 'Softeam', 'ESN / IT Services', 'France', 'ESN avec practice Life Science / Pharma.', 'ETI', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000007', 'StillNetWork', 'Intégrateur Réseau & Sécurité', 'France / International', 'Intégrateur réseau & sécurité, champion croissance 2025. Partenaire Cisco, Fortinet. Présence FR/CH/CA/US.', 'PME', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000008', 'Yousign', 'SaaS (signature électronique)', 'France', 'Leader européen de la signature électronique. 40M€+ ARR, 28 000+ clients.', 'ETI', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-000000000009', 'Partoo', 'SaaS SMB', 'France', 'Plateforme de visibilité locale pour commerçants/restaurateurs. Scale-up.', 'PME', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('e0000001-0000-0000-0000-00000000000a', 'Malou', 'SaaS Restauration', 'France', 'SaaS marketing digital pour restaurants.', 'STARTUP', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── CLIENTS ─────────────────────────────────────────────────

INSERT INTO clients (id, nom, prenom, poste, "roleContact", "entrepriseId", "statutClient", notes, "createdById", "assignedToId", "createdAt", "updatedAt") VALUES
  ('c0000001-0000-0000-0000-000000000001', 'Léo', NULL, 'Hiring Manager / Recrutement', 'HIRING_MANAGER', 'e0000001-0000-0000-0000-000000000001', 'MANDAT_SIGNE', 'Interlocuteur principal côté recrutement. Gère le pipe candidats.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000002', 'Pauline', NULL, 'VP Revenue', 'AUTRE', 'e0000001-0000-0000-0000-000000000001', 'MANDAT_SIGNE', 'N+1 des deux postes. Entretien stage 2/3.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000003', 'Furlani', 'Nicolas', 'CEO', 'CEO', 'e0000001-0000-0000-0000-000000000001', 'MANDAT_SIGNE', 'CEO historique. Entretien final.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000004', 'Mbaye', 'Momar', 'CEO / Fondateur', 'CEO', 'e0000001-0000-0000-0000-000000000002', 'MANDAT_SIGNE', 'Fondateur. Interlocuteur unique. Isatis Capital au capital.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000005', 'Héliot', 'Rodolphe', 'Fondateur', 'CEO', 'e0000001-0000-0000-0000-000000000003', 'MANDAT_SIGNE', 'Co-fondateur. Station F + Toulouse. Levée 3,2M€.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000006', 'Houda', NULL, 'Fondatrice', 'CEO', 'e0000001-0000-0000-0000-000000000004', 'MANDAT_SIGNE', 'ESN Marketing Automation. Cherche un binôme.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000007', 'El Mejri', 'Brahim', 'Client', 'AUTRE', 'e0000001-0000-0000-0000-000000000005', 'MANDAT_SIGNE', '2 BDM Maroc, budget < 12 000 MAD/mois. Guillermo en support.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000008', 'Mopin', 'Jennifer', 'Client', 'AUTRE', 'e0000001-0000-0000-0000-000000000006', 'MANDAT_SIGNE', 'Poste Business Manager Life Science.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('c0000001-0000-0000-0000-000000000009', 'Méric', 'Clément', 'Client', 'AUTRE', 'e0000001-0000-0000-0000-000000000007', 'MANDAT_SIGNE', 'Intégrateur réseau & sécurité. Champion croissance 2025.', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE clients SET email = 'mmbaye@groupesenef.com' WHERE id = 'c0000001-0000-0000-0000-000000000004';

-- ── MANDATS ─────────────────────────────────────────────────

INSERT INTO mandats (id, "titrePoste", "entrepriseId", "clientId", description, localisation, "salaryRange", "feePourcentage", statut, priorite, notes, "ficheDePoste", "createdById", "assignedToId", "dateOuverture", "createdAt", "updatedAt") VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Head of Sales', 'e0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001',
   'Manager & coacher l''équipe (10 AE + 5 SDR). Construire le playbook commercial. Pilotage data-driven. Closer les comptes stratégiques. Stratégie commerciale 7→10M€+ ARR.',
   'Paris 9ème, hybride', '80-120K€ (60-100K fixe + 20K var)', 20.00, 'EN_COURS', 'URGENTE',
   'Interlocuteurs: Léo, Pauline (VP Revenue), Nicolas Furlani (CEO). Process: Léo → Case study → Pauline → CEO.',
   E'ENTREPRISE\nJoy (ex-Privateaser) — SaaS CHR. 7M€ ARR, 2 000+ clients, objectif 10M€+.\n\nPACKAGE: 80-120K€\nÉQUIPE: ~10 AE + 5 SDR\nRATTACHEMENT: Pauline, VP Revenue\n\nMISSIONS\n• Manager & coacher l''équipe (10 AE + 5 SDR)\n• Construire le playbook commercial\n• Pilotage data-driven : KPIs, reporting, dashboards\n• Closer comptes stratégiques\n• Stratégie 7→10M€+ ARR\n\nPROFIL\n• 5+ ans vente SaaS B2B SMB/Mid Market\n• 2+ ans Team Lead, équipe 10+\n• Coach terrain, culture data\n• Anglais courant',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000002', 'Head of Account Management', 'e0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001',
   'Piloter rétention et revenu : churn, upsell/cross-sell, conversion Privateaser→Joy. KPIs, health scores. Construire organisation AM scalable.',
   'Paris 9ème, hybride', '80-100K€ (60-80K fixe + 20-24K var)', 20.00, 'EN_COURS', 'URGENTE',
   'Interlocuteurs: Léo, Pauline (VP Revenue), Nicolas Furlani (CEO). Process: Léo → Case study → Pauline → CEO.',
   E'ENTREPRISE\nJoy (ex-Privateaser) — même contexte que Head of Sales\n\nPACKAGE: 80-100K€\nÉQUIPE: 4 AM rétention\nRATTACHEMENT: Pauline, VP Revenue\n\nMISSIONS\n• Piloter rétention et revenu\n• KPIs, health scores, rituels\n• Organisation AM scalable\n\nPROFIL\n• IC Sales/AM 3+ ans SaaS B2B SMB\n• Management 3+ ans\n• Track record churn, NRR\n• Anglais courant',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000003', 'Head of Sales / Directeur Commercial', 'e0000001-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000004',
   'Structurer outbound from scratch (100% inbound → 60% outbound). Définir ICP, playbooks. Manager 4 commerciaux. Closer comptes stratégiques.',
   'Hybride, Région parisienne', 'À définir', 20.00, 'EN_COURS', 'URGENTE',
   'Interlocuteur: Momar Mbaye (CEO). Scorecard /145.',
   E'ENTREPRISE\nGroupe SENEF — SaaS ERP métiers. 10M€ ARR. Isatis Capital.\n\nÉQUIPE: 4 commerciaux\nPOSTURE: Player-coach 60/40\n\nMISSIONS\n• Outbound from scratch\n• ICP, playbooks, PipeDrive\n• Manager 4 commerciaux\n• Closer comptes stratégiques\n• Croissance externe\n\nPROFIL\n• 5-10 ans B2B SaaS + management\n• Construction outbound\n• Vente consultative PME\n• Culture SaaS, metrics',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000004', 'Head of Marketing', 'e0000001-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000004',
   'Piloter croissance globale SENEF. Stratégie et exécution marketing. Structurer la fonction marketing. Binôme avec futur Head of Sales.',
   'Hybride, Région parisienne', 'À définir', 20.00, 'EN_COURS', 'HAUTE',
   'Interlocuteur: Momar Mbaye (CEO). Brief à affiner.',
   E'ENTREPRISE\nGroupe SENEF — même contexte\n\nMISSIONS\n• Piloter croissance globale\n• Stratégie + exécution marketing\n• Structurer fonction marketing from scratch\n• Binôme avec Head of Sales\n\nPROFIL\nÀ affiner — profil structurant, builder',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000005', 'Founding Account Executive', 'e0000001-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000005',
   'Machine commerciale from zéro. 10→100 clients. Vente aux BET. Structurer pipe et playbooks.',
   'Paris (Station F) + Toulouse', 'À définir (fixe + variable)', 20.00, 'EN_COURS', 'HAUTE',
   'Interlocuteur: Rodolphe Héliot. Panier moyen 30-40K€ ARR/client.',
   E'ENTREPRISE\nTemelion — ConstructionTech IA. 3,2M€ levés. 10 clients → 100.\n\nMISSIONS\n• Machine commerciale from zéro\n• 10→100 clients BET\n• Prospection + closing full-cycle\n• Structurer pipe et playbooks\n\nPROFIL\n• Hunter, early-stage\n• Connaissance BET/AEC/BIM\n• Track record chiffré\n• Autonomie totale',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000006', 'Associé(e)', 'e0000001-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000006',
   'Binôme / associé(e) pour co-piloter l''entreprise. Profil complémentaire, opérationnel.',
   NULL, 'À définir', 20.00, 'EN_COURS', 'HAUTE',
   'Interlocutrice: Houda. Brief à affiner.',
   E'ENTREPRISE\nSmaart Consulting — ESN Marketing Automation\n\nMISSIONS\nCo-piloter l''entreprise avec Houda\n\nPROFIL\nComplémentaire à Houda, opérationnel, co-diriger ESN',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000007', 'Business Manager x2', 'e0000001-0000-0000-0000-000000000005', 'c0000001-0000-0000-0000-000000000007',
   '2 postes Business Manager juniors, budget < 12 000 MAD/mois.',
   'Maroc', '< 12 000 MAD/mois', 20.00, 'EN_COURS', 'HAUTE',
   'Client: Brahim El Mejri. Guillermo en support.',
   E'Crystal Placement\nLOCALISATION: Maroc\nBUDGET: < 12 000 MAD/mois\nPROFIL: 2 BM juniors',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000008', 'Business Manager Life Science', 'e0000001-0000-0000-0000-000000000006', 'c0000001-0000-0000-0000-000000000008',
   'BM spécialisé Life Science / Pharma. Cibles: Pharmasys, Consultys, Veeva, IQVIA, Ennov, Astek pharma, Alten pharma.',
   'France', 'À définir', 20.00, 'EN_COURS', 'HAUTE',
   'Cliente: Jennifer Mopin. Brief à affiner.',
   E'Softeam\nPROFIL: BM Life Science / Pharma\nCIBLES: Pharmasys, Infogene, Consultys, Vulcain, Veeva, IQVIA, Ennov, Astek pharma, Alten pharma, Akkodis',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW()),

  ('a0000001-0000-0000-0000-000000000009', 'Business Manager Cisco', 'e0000001-0000-0000-0000-000000000007', 'c0000001-0000-0000-0000-000000000009',
   'Développer portefeuille solutions Campus et Sécurité. Vente technique DSI. Partenaires Cisco, Fortinet.',
   'France', 'À définir (fixe + variable)', 20.00, 'EN_COURS', 'HAUTE',
   'Client: Clément Méric. Cibles: Nomios, Cheops, Axians, Spie ICS, Computacenter, SCC.',
   E'StillNetWork — champion croissance 2025\n\nMISSIONS\n• Portefeuille Campus & Sécurité\n• Vente DSI et infra\n• Cisco, Fortinet\n\nPROFIL: Commercial terrain, infra réseau/sécurité\nCIBLES: Nomios, Cheops, Axians, Spie ICS, Computacenter, SCC, Overlap, NTT',
   'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── CANDIDATS ───────────────────────────────────────────────

INSERT INTO candidats (id, nom, prenom, "posteActuel", "entrepriseActuelle", source, notes, tags, "createdById", "assignedToId", "createdAt", "updatedAt") VALUES
  ('d0000001-0000-0000-0000-000000000001', 'Lavagna', 'Juliette', 'Candidate Head of Sales', NULL, 'Sourcing', '1er stage vendredi avec Léo.', ARRAY['Joy', 'Head of Sales'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('d0000001-0000-0000-0000-000000000002', 'Roubaud', 'Mathieu', 'Head of CS', 'Malou', 'Sourcing', '100% CHR natif. Management 8 pers. dont 2 Team Leads. Ownership rétention/expansion/churn. Bâtisseur. Le seul profil CHR natif du pipe.', ARRAY['Joy', 'Head of AM', 'CHR natif'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('d0000001-0000-0000-0000-000000000003', 'Dessaint', 'Davy', 'Head of Customer Services', 'Yousign', 'Sourcing', 'Yousign 6 ans, <1M→40M€ ARR. 28 000 clients. 26-31 pers. managées. 110% target. Tout construit from scratch. TOP profil. Préavis 2-3 mois.', ARRAY['Joy', 'Head of AM', 'TOP profil'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('d0000001-0000-0000-0000-000000000004', 'Legay', 'Romain', 'CRO', 'Partoo', 'Sourcing', 'Co-#1 shortlist (131/145). 20 ans vente SMB terrain. PagesJaunes 10 ans. Scaling 2→23 sales (Justifit). CRO Partoo 5 ans.', ARRAY['SENEF', 'Head of Sales', 'Shortlist'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('d0000001-0000-0000-0000-000000000005', 'Potin', 'Matthieu', 'Builder / CRO', NULL, 'Sourcing', 'Co-#1 shortlist (133/145). Contexte PE/M&A, pilotage P&L, vente PME traditionnelles.', ARRAY['SENEF', 'Head of Sales', 'Shortlist'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('d0000001-0000-0000-0000-000000000006', 'Spasic', 'Nicolas', 'Founding AE', NULL, 'Sourcing', 'N°1 shortlist (4.85/5). 18 ans BET. Track record 284%. Founding team x2. Package ~140K€ OTE.', ARRAY['Temelion', 'Founding AE', 'N°1'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW()),
  ('d0000001-0000-0000-0000-000000000007', 'Eznati', 'Morane', 'Candidate Founding AE', NULL, 'Sourcing', '1er stage à venir avec Rodolphe Héliot.', ARRAY['Temelion', 'Founding AE'], 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', 'fd77cf60-5736-4180-bdb2-addf2a5c4d7e', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── CANDIDATURES (Pipeline) ─────────────────────────────────

INSERT INTO candidatures (id, "candidatId", "mandatId", stage, notes, "createdAt", "updatedAt") VALUES
  ('b0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'ENTRETIEN_1', '1er stage vendredi avec Léo. À évaluer.', NOW(), NOW()),
  ('b0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', 'ENTRETIEN_1', 'GO. 100% CHR natif. Track record à creuser.', NOW(), NOW()),
  ('b0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000002', 'ENTRETIEN_CLIENT', 'TOP. 2ème stage avec Pauline. Package 100K€. Préavis 2-3 mois.', NOW(), NOW()),
  ('b0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000003', 'ENTRETIEN_CLIENT', 'GO FORT (131/145). Meilleur fit segment client. Package ~120-150K€.', NOW(), NOW()),
  ('b0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000003', 'ENTRETIEN_CLIENT', 'GO FORT (133/145). PE/M&A. CDI + remote à confirmer.', NOW(), NOW()),
  ('b0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000005', 'ENTRETIEN_CLIENT', 'N°1 shortlist (4.85/5). Package ~140K€ OTE.', NOW(), NOW()),
  ('b0000001-0000-0000-0000-000000000007', 'd0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000005', 'ENTRETIEN_1', '1er stage à venir avec Rodolphe.', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── VERIFICATION ────────────────────────────────────────────
SELECT 'Entreprises' as entity, COUNT(*) as count FROM entreprises WHERE id::text LIKE 'e0000001%'
UNION ALL
SELECT 'Clients', COUNT(*) FROM clients WHERE id::text LIKE 'c0000001%'
UNION ALL
SELECT 'Mandats', COUNT(*) FROM mandats WHERE id::text LIKE 'a0000001%'
UNION ALL
SELECT 'Candidats', COUNT(*) FROM candidats WHERE id::text LIKE 'd0000001%'
UNION ALL
SELECT 'Candidatures', COUNT(*) FROM candidatures WHERE id::text LIKE 'b0000001%';
