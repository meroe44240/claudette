# -*- coding: utf-8 -*-
"""Génère outputs/sales_saas_2026-09-03.csv (vertical SALES SaaS - Louis)."""
import csv, os

HEADER = ["nom","prenom","email","telephone","poste","entreprise","localisation",
          "linkedin","source","tags","notes"]

V = "SALES_SAAS"
DATE_JOUR = "2026-09-03"

def note(poste, date, effectif, ca, salaire, source, lien, contexte, extra=""):
    base = (f"Poste: {poste} | Date: {date} | Effectif: {effectif} | CA: {ca} | "
            f"Salaire: {salaire} | Source: {source} | Lien: {lien} | Contexte: {contexte}")
    if extra:
        base += f" | {extra}"
    return base.replace(";", "|")

rows = []

def opp(entreprise, ville, source, kind, eff_range, n_note, c1, c2):
    """c1/c2 = (nom, prenom, poste, contact_type, linkedin, non_source)"""
    for c, tag in ((c1, "CONTACT_1"), (c2, "CONTACT_2")):
        nom, prenom, poste, ctype, li, ns = c
        tags = f"{V},{kind},{ctype},{eff_range},{tag}"
        if ns:
            tags += ",CONTACT_NON_SOURCE"
        rows.append([nom, prenom, "", "", poste, entreprise, ville, li, source, tags, n_note])

# ---------------------------------------------------------------- JOB (14) ---
opp("Tenacy", "Lyon (69)", "Welcome to the Jungle", "JOB", "50-500",
    note("Account Executive Confirme/Senior (CDI)", "NC (annonce en ligne au 2026-09-03)",
         "~50-100 (2024)", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/tenacy/jobs/account-executive-confirme-senior-cdi_lyon",
         "Editeur SaaS lyonnais de pilotage de la cybersecurite (fonde 2019). Serie A de 6 M EUR "
         "(Axeleo Capital, Auriga Cyber Ventures, Kreaxi, Teamwork, Credit Agricole Creation). "
         "Recrute 2 AE + 1 Inside Sales -> structuration de l'equipe commerciale."),
    ("Guillet", "Cyril", "CEO & cofondateur", "CEO", "", False),
    ("", "", "Head of Talent Acquisition", "TALENT_ACQUISITION", "", True))

opp("inwink", "Paris (75)", "Welcome to the Jungle", "JOB", "NC",
    note("Partnership Manager - Martech SaaS BtoB (CDI)", "NC (annonce en ligne au 2026-09-03)",
         "NC", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/inwink/jobs/responsable-partenaires-inwink-cdi-h-f_paris",
         "Plateforme SaaS B2B d'evenementiel et d'engagement de communautes (groupe Infinite Square). "
         "Creation d'un poste de Responsable Partenaires : ouverture d'un canal indirect agences/editeurs."),
    ("Santin", "Florent", "Co-CEO", "CEO", "", False),
    ("Laforest", "Pascal", "Co-CEO", "CEO", "", False))

opp("Mayday", "Paris (75)", "Welcome to the Jungle", "JOB", "NC",
    note("Head of Sales (Product IA International) + Business Development Representative",
         "NC (annonce en ligne au 2026-09-03)", "NC", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/mayday/jobs/head-of-sales-product-ia-international_paris",
         "Editeur SaaS de knowledge management pour services clients (Fnac Darty, EDF, Free). "
         "Rachete par le groupe allemand USU en septembre 2025 pour batir le leader europeen du KM : "
         "recrutement simultane d'un Head of Sales (8 ans+ SaaS Enterprise) et d'un BDR."),
    ("Popote", "Damien", "CEO & cofondateur", "CEO", "https://www.linkedin.com/in/damienpopote/", False),
    ("", "", "Talent Acquisition / DRH", "TALENT_ACQUISITION", "", True))

opp("Qobra", "Paris (75)", "Welcome to the Jungle", "JOB", "NC",
    note("Customer Success Manager Onboarding (CDI)", "NC (annonce en ligne au 2026-09-03)",
         "NC", "~8 M$ ARR (source getlatka)", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/en/companies/qobra/jobs/customer-success-manager-onboarding-cdi-paris_paris",
         "Editeur SaaS de sales compensation (commissionnement temps reel), 350+ clients, "
         "adosse a Singular et Breega. Equipe CS de 8 personnes en extension."),
    ("Fort", "Antoine", "CEO & cofondateur", "CEO", "https://www.linkedin.com/in/antoine-fort/", False),
    ("", "", "Talent Acquisition / DRH", "TALENT_ACQUISITION", "", True))

opp("N2JSoft (N2F)", "Lyon (69)", "Welcome to the Jungle", "JOB", "50-500",
    note("Sales Enablement Manager B2B SaaS + Revenue Operations Manager",
         "NC (annonce en ligne au 2026-09-03)", "130 (2024)", ">10 M EUR (2023, +60%)", "NC",
         "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/n2jsoft-fr/jobs/sales-enablement-manager-b2b-saas_lyon_N2JSO_1P47kww",
         "Editeur SaaS de gestion des notes de frais (N2F) : 16 000 clients, 90 pays. "
         "Effectif passe de 70 a 130 en un an. Recrute Sales Enablement + RevOps + SDR : "
         "structuration complete de la machine commerciale."),
    ("Dubouloz", "Nicolas", "CEO & fondateur", "CEO", "", False),
    ("", "", "Talent Acquisition / DRH", "TALENT_ACQUISITION", "", True))

opp("Reecall", "Lyon (69)", "Welcome to the Jungle", "JOB", "NC",
    note("Sales Development Representative (CDI)", "NC (annonce en ligne au 2026-09-03)",
         "NC", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/reecall/jobs/business-developer_paris",
         "Editeur d'agents vocaux IA pour la relation client (Lyon & Paris, cree en 2019). "
         "Recrute un SDR pour accelerer la croissance sur les cibles PME/ETI e-commerce, SaaS et assurance."),
    ("Trouche", "Maxime", "Cofondateur & CEO", "CEO", "", False),
    ("Szymocha", "Raphael", "Cofondateur", "FONDATEUR", "", False))

opp("Uptale", "Paris (75)", "Welcome to the Jungle", "JOB", "NC",
    note("B2B Account Executive (AI & Immersive Learning)", "NC (annonce en ligne au 2026-09-03)",
         "NC", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/uptale/jobs/sales-development-representative-sdr-education-secteur-public_tunis",
         "Plateforme SaaS d'immersive learning (VR/AR) utilisee par 75% du CAC40 et par Harvard. "
         "Levee de 9 M EUR fin 2024, recrute des AE B2B pour couvrir l'international."),
    ("Ristagno", "David", "CEO & cofondateur", "CEO", "", False),
    ("Iserief", "Dwayne", "CMO & cofondateur", "FONDATEUR", "", False))

opp("A World For Us (Digiforma)", "Paris (75)", "Welcome to the Jungle", "JOB", "NC",
    note("Account Executive (Sales & Customer Success) - Digiforma Certif",
         "NC (annonce en ligne au 2026-09-03)", "NC", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/a-world-for-us/jobs/account-executive-sales-customer-success-digiforma-certif-h-f-edtech-saas_paris",
         "Editeur SaaS EdTech (Digiforma) pour organismes de formation, autofinance (aucun fonds au capital). "
         "Vient de prendre une participation majoritaire dans l'editeur Rich-ID (certifications pro) : "
         "nouvelle ligne produit Digiforma Certif a commercialiser."),
    ("Delorme", "Stephane", "Cofondateur", "FONDATEUR", "", False),
    ("", "", "Talent Acquisition / DRH", "TALENT_ACQUISITION", "", True))

opp("Kel Foncier", "Paris (75)", "Welcome to the Jungle", "JOB", "50-500",
    note("Customer Success Manager / Charge de relation client B2B (CDI)",
         "NC (annonce en ligne au 2026-09-03)", "~50", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/kel-foncier/jobs/customer-success-manager-charge-de-relation-client-b2b-h-f_paris",
         "Editeur SaaS data & analytics du foncier pour promoteurs immobiliers et energies renouvelables "
         "(cree en 2010, laureat Pass French Tech). Renforce l'equipe relation client B2B."),
    ("Larrain", "Eduardo", "Fondateur & CEO", "CEO", "", False),
    ("", "", "Talent Acquisition / DRH", "TALENT_ACQUISITION", "", True))

opp("Novalend Tech Solutions", "Puteaux (92)", "Welcome to the Jungle", "JOB", "5-50",
    note("Customer Success Manager - Solutions SaaS Leasing B2B", "NC (annonce en ligne au 2026-09-03)",
         "19 (2026)", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/novalend-fr/jobs/customer-success-manager-h-f-solutions-saas-leasing-b2b_puteaux_NTS_031Xk7K",
         "Editeur SaaS pour les acteurs du leasing B2B (banques, brokers, industriels), cree en 2020. "
         "Premier recrutement CSM structurant sur une equipe de moins de 20 personnes."),
    ("", "", "CEO & cofondateur", "CEO", "", True),
    ("", "", "DRH / Office Manager", "DRH", "", True))

opp("Modulotech", "Issy-les-Moulineaux (92)", "Welcome to the Jungle", "JOB", "5-50",
    note("Customer Success Manager (CDI)", "NC (annonce en ligne au 2026-09-03)",
         "20-49 (2023)", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/modulotech/jobs/customer-success-manager_issy-les-moulineaux",
         "Editeur de logiciel de gestion des interventions terrain (cree 2011). "
         "Creation from scratch de la fonction Customer Success : premier CSM de la societe."),
    ("Philibin", "Julien", "Fondateur", "FONDATEUR", "", False),
    ("", "", "DRH / Talent Acquisition", "DRH", "", True))

opp("Localranker", "Paris (75)", "Welcome to the Jungle", "JOB", "5-50",
    note("Customer Success Manager Grands Comptes (SaaS B2B)", "NC (annonce en ligne au 2026-09-03)",
         "~10", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/localranker/jobs/account-manager-grands-comptes-strategic-customer-success-manager-saas-b2b_paris",
         "Solution SaaS tout-en-un de SEO local pour reseaux de points de vente (8 000 points de vente : "
         "Century 21, Continental, Mister Menuiserie). Ouvre un poste Grands Comptes : montee en gamme du portefeuille."),
    ("Moinard", "Nicolas", "Cofondateur & CEO", "CEO", "https://www.linkedin.com/in/nicolas-moinard/", False),
    ("Lee", "Jamey", "Cofondateur & CMO", "FONDATEUR", "https://www.linkedin.com/in/jamey-lee/", False))

opp("Shapr", "Paris (75)", "Welcome to the Jungle", "JOB", "NC",
    note("Customer Success Manager B2B - SaaS (2 postes)", "NC (annonce en ligne au 2026-09-03)",
         "NC", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/shapr/jobs/customer-success-manager-b2b-saas_paris_SHAPR_AWZyVDQ",
         "Plateforme de mise en relation professionnelle en bascule vers une offre B2B "
         "(14,8 M EUR leves au total). Deux postes CSM B2B SaaS ouverts en parallele."),
    ("Huraux", "Ludovic", "Cofondateur & CEO", "CEO", "", False),
    ("Bobin", "Vincent", "Cofondateur", "FONDATEUR", "", False))

opp("Agnostik", "Paris (75)", "Welcome to the Jungle", "JOB", "5-50",
    note("Account Executive - Logiciel SaaS Privacy Tech (CDI)", "NC (annonce en ligne au 2026-09-03)",
         "NC (groupe Didomi ~200)", "NC", "NC", "Welcome to the Jungle",
         "https://www.welcometothejungle.com/fr/companies/agnostik/jobs/account-executive-cdi-logiciel-saas-privacy-tech_paris",
         "Editeur SaaS Privacy Tech (conformite RGPD/CNIL) pour medias et e-commerce, "
         "adosse au groupe Didomi depuis 2022. Recrute un AE sur l'offre logicielle."),
    ("Ducret", "Frank", "CEO & fondateur", "CEO", "", False),
    ("", "", "Talent Acquisition / DRH", "TALENT_ACQUISITION", "", True))

# --------------------------------------------------------------- NEWS (6) ---
opp("MyUnisoft", "Saint-Quentin-en-Yvelines (78)", "ChannelNews", "NEWS", "50-500",
    note("Plan de recrutement 100 postes 2026", "2026 (mois non confirme)",
         "253 -> 353 vise fin 2026", "NC", "NC", "ChannelNews",
         "https://www.channelnews.fr/myunisoft-annonce-100-recrutements-en-2026-155383",
         "Editeur SaaS de comptabilite (1 300 cabinets, 250 000 TPE/PME). Annonce 100 recrutements "
         "en 2026 pour passer de 253 a 353 salaries. Majorite des postes a Saint-Quentin-en-Yvelines, "
         "une dizaine a Toulouse. Actionnaire majoritaire depuis decembre : HgCapital, aux cotes de "
         "125 cabinets d'expertise comptable actionnaires.",
         "Fonds: HgCapital | Montant: NC"),
    ("", "", "Directeur General", "DG", "", True),
    ("", "", "DRH / Talent Acquisition", "DRH", "", True))

opp("padoa", "Paris (75)", "Thoma Bravo (communique) / Kirkland & Ellis", "NEWS", "50-500",
    note("Prise de participation majoritaire", "2026-07 (finalisation)",
         "NC (~400)", "NC", "NC", "Thoma Bravo",
         "https://www.thomabravo.com/press-releases/thoma-bravo-completes-acquisition-of-padoa",
         "Editeur SaaS leader europeen de la sante et prevention au travail (SPST), fonde en 2016 chez "
         "Kamet Ventures. Thoma Bravo prend une participation majoritaire via son fonds Europe de 1,8 Md EUR ; "
         "Five Arrows (Rothschild & Co) et Kamet restent au capital. Plan : expansion internationale (DACH) "
         "et investissement produit/IA -> recrutements commerciaux attendus.",
         "Fonds: Thoma Bravo (fonds Europe 1|8 Md EUR) | Montant: NC"),
    ("", "", "CEO / Directeur General", "CEO", "", True),
    ("", "", "DRH / Talent Acquisition", "DRH", "", True))

opp("Aria", "Paris (75)", "EU-Startups", "NEWS", "NC",
    note("Levee 7 M EUR + facilite de dette 240 M EUR", "2026-07",
         "NC", "NC", "NC", "EU-Startups",
         "https://www.eu-startups.com/2026/07/paris-based-aria-raises-e7-million-and-launches-e240-million-debt-facility-to-tackle-europes-late-payment-crisis/",
         "Fintech B2B parisienne de financement de factures embarque (embedded invoice financing). "
         "Leve 7 M EUR en equity et ouvre une facilite de dette de 240 M EUR pour attaquer le probleme "
         "des retards de paiement en Europe : phase de deploiement commercial paneuropeen.",
         "Fonds: NC | Montant: 7 M EUR equity + 240 M EUR de dette"),
    ("", "", "CEO / Cofondateur", "CEO", "", True),
    ("", "", "DRH / Talent Acquisition", "DRH", "", True))

opp("Vocca", "Paris (75)", "The SaaS News", "NEWS", "NC",
    note("Levee seed 5,5 M$", "2026-08-11", "NC", "NC", "NC", "The SaaS News",
         "https://www.thesaasnews.com/news/vocca-raises-5-5-million-in-seed-round/",
         "Startup parisienne de voice AI appliquee a la sante (automatisation de l'accueil telephonique "
         "des cabinets et structures de soins). Tour de seed de 5,5 M$ boucle le 11 aout 2026 : "
         "phase classique de constitution d'une premiere equipe sales/CS.",
         "Fonds: NC | Montant: 5,5 M$"),
    ("", "", "CEO / Cofondateur", "CEO", "", True),
    ("", "", "DRH / Talent Acquisition", "DRH", "", True))

opp("ColibriTD", "Paris (75)", "EU-Startups", "NEWS", "5-50",
    note("Levee seed 4 M EUR", "2026-08-27", "NC", "NC", "NC", "EU-Startups",
         "https://www.eu-startups.com/2026/08/paris-based-colibritd-raises-e4-million-to-scale-its-quantum-powered-multiphysics-simulation-platform",
         "Editeur deeptech B2B parisien (fonde 2019) d'une plateforme de simulation multiphysique "
         "acceleree par le calcul quantique. Seed de 4 M EUR menee par Earlybird Venture Capital avec "
         "SymbiaVC et Medin VC, pour passer a l'echelle commerciale (industrie, energie, aeronautique).",
         "Fonds: Earlybird Venture Capital (lead) | SymbiaVC | Medin VC | Montant: 4 M EUR"),
    ("Guiraud", "Laurent", "Cofondateur", "FONDATEUR", "", False),
    ("Goudjil", "Hacene", "Cofondateur", "FONDATEUR", "", False))

opp("Innovorder", "Paris (75)", "EU-Startups", "NEWS", "50-500",
    note("Levee 20 M EUR", "2026-06", "NC (~150)", "NC", "NC", "EU-Startups",
         "https://www.eu-startups.com/2026/06/profitable-french-scale-up-innovorder-raises-e20-million-to-accelerate-ai-first-restaurant-digitalisation/",
         "Scale-up SaaS rentable de digitalisation de la restauration (caisse, commande, back-office). "
         "Leve 20 M EUR pour accelerer sa bascule AI-first : signal de croissance commerciale, "
         "hors fenetre 30 jours (juin 2026) mais operation recente et societe non surmediatisee.",
         "Fonds: NC | Montant: 20 M EUR"),
    ("", "", "CEO / Directeur General", "CEO", "", True),
    ("", "", "DRH / Talent Acquisition", "DRH", "", True))

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "outputs", "sales_saas_2026-09-03.csv")
with open(out, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";", lineterminator="\r\n")
    w.writerow(HEADER)
    w.writerows(rows)
print("ecrit:", out, "|", len(rows), "lignes de donnees")
