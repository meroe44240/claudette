# AGENTS.md

How AI agents work in Propium (HumanUp's ATS) through its MCP server. This file is generated from the code by `pnpm --filter @humanup/api gen:agents-md`; a test fails when it is out of date.

## Connect

- MCP endpoint: `https://ats.propium.co/mcp` (Streamable HTTP).
- Authentication: `Authorization: Bearer <agent key>`. Each agent has its own key (`pk_agent_…`), created on the Agents page by an admin. Everything you do is recorded as "<Name> (agent)".
- Rate limit: per agent, set on the Agents page. Over the limit you get a clear error with the number of seconds to wait.

## Rules of the house

1. **Read before you write.** Start with `describe_schema` to learn the entities, fields and codes, and `search_all` / `list_records` to find records. Never create a record without checking it does not exist.
2. **Check ownership before working an account.** `get_owner` on a company, lead or client contact; take it with `claim_owner`. If it belongs to someone else you get a conflict with the current owner: talk to them, do not work it.
3. **Check before pushing a candidate.** `is_candidate_presented` before presenting a candidate to a company, and `get_candidate_push_status` to know if the candidate can be pushed.
4. **Make retries safe.** Every write tool accepts `idempotency_key`: reuse the same key when you retry the same action and it will not be done twice (no duplicate record, no second email).
5. **Try first when unsure.** Generic writes, bulk tools, imports and deletions accept `dry_run: true`: you see the result, nothing is saved.
6. **Everything can be undone.** Every call that writes returns a `batch_id`; `undo {"batch_id"}` reverts it. Deleted records stay 30 days in the trash (`list_trash`, `restore_record`). External actions (email, SMS, call, portal access) cannot be undone: they are marked "external" in the journal.
7. **Use the business tools for business actions.** Pipeline stages change with `move_candidate_stage` / `bulk_move_candidate_stage`, lead stages with `move_lead_stage`, ownership with `claim_owner`. The generic tools refuse these fields and tell you which tool to use.
8. **React to events instead of polling everything.** `get_events` with `since`, then keep the `next_cursor`. Admins can also subscribe a URL with `create_webhook`.

## Conventions

- Answers are in English. Ids are UUIDs and are always returned.
- Lists are compact by default; ask for more with `fields` and `include`. Pages use `cursor` / `next_cursor`.
- Pipeline stages come as a code plus an English name: `SOURCING` Sourcing, `CONTACTE` Qualification, `ENTRETIEN_1` Internal interview, `ENVOYE_CLIENT` Sent to client, `ENTRETIEN_CLIENT` Client interview, `PROCESS` Process, `OFFRE` Offer, `PLACE` Won, `REFUSE` Lost. Talk to people with the English name.
- Errors say what to do: missing field, expected values, closest field name, owner in place.
- Field names of the data model are French (`nom`, `prenom`, `entrepriseId`…): `describe_schema` lists them with their meaning.

## Events

- `mandate.created`: A mandate was created
- `mandate.closed`: A mandate was closed (won, lost, cancelled or closed)
- `candidate.created`: A candidate was created
- `candidate.tag_added`: A tag (or the A-Player flag) was added to a candidate
- `candidate.tag_removed`: A tag (or the A-Player flag) was removed from a candidate
- `stage.changed`: An application moved to another pipeline stage, or a lead to another prospecting stage
- `lead.created`: A lead was created
- `meeting.created`: A meeting was created (booking link, calendar meeting logged in Propium)
- `presentation.created`: A candidate was presented to a company
- `company.created`: A company was created
- `owner.changed`: The owner of a company, lead or client contact changed
- `document.added`: A document was added (CV, attachment)

Each event gives its type, the record (type, id, label), who did it (`null` for automations), when, and details. Webhooks receive the same JSON, signed with `X-Propium-Signature: sha256=<HMAC-SHA256 of the raw body>`.

## Tools (128)

### Start here

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `describe_schema` | Describes the data model: without entity, the list of entities, business codes (pipeline stages with English names, lead stages, presentation channels and statuses, event types); with entity, every field with its type, whether it is required, its possible values, what it links to, and whether you… | entity |
| `get_daily_brief` | User's morning brief: 5 KPIs (calls, presentations, meetings, placements, revenue), today's agenda, active pipeline per mandate, follow-ups to do (no activity for more than 7 days), tasks. | date, relances_threshold_days |
| `get_events` | Events since a date, oldest first, so you can react without re-reading everything. | since, cursor, types, entity_id, limit |
| `plan_my_day` | Proposes a plan for the day in time blocks (deep work / calls / follow-ups / admin) based on the user's agenda, urgent tasks and pending follow-ups. | date, start_hour, end_hour, lunch_start_hour, lunch_duration_min |
| `search_all` | Global search across candidate, company, client, mandate, lead, job_offer, like the search bar of the web app. | **q**, types, limit |

### Undo, trash and history

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `get_record_history` | Change history of one record, newest first: who changed what, when, from which tool, with old and new values. | **entity**, **id**, limit |
| `list_trash` | Lists what was deleted in the last 30 days, newest first, one row per deletion (a deletion can remove several linked records at once, e.g. a candidate with its applications). | entity, q, page, limit |
| `restore_record` | Restores a deletion from the trash: the record and everything removed with it come back with their original ids. | **id** |
| `undo` | Undoes everything one tool call did, using the batch_id returned by that call (also visible in get_record_history and on the Journal page): updates go back to their old values, creations are deleted (to the trash), deletions are restored. | **batch_id** |

### Any entity (generic tools)

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `bulk_create_records` | Creates up to 500 records in one call, with a line-by-line report. | **entity**, **rows**, dry_run, stop_on_error |
| `bulk_delete_records` | Deletes up to 500 records (by ids or by filter). | **entity**, ids, where, q, dry_run, stop_on_error |
| `bulk_update_records` | Updates up to 500 records: either "items" (one id + data each) or "ids" / "where" with one "data" for all. | **entity**, items, ids, where, q, data, dry_run, stop_on_error |
| `create_record` | Creates a record of any entity (field names as in list_records). | **entity**, **data**, dry_run |
| `delete_record` | Deletes a record. | **entity**, **id**, dry_run |
| `export_records_csv` | Exports a filtered view of one entity as CSV text (comma separated, header = field names), up to 5000 rows. | **entity**, where, q, sort, fields, limit |
| `get_record` | Gets one record with all its fields, plus related data with include. | **entity**, **id**, fields, include |
| `import_records_csv` | Imports up to 500 rows from CSV text (comma, semicolon or tab separated; first row = headers). | **entity**, **csv**, mapping, match_on, dry_run, stop_on_error |
| `list_records` | Lists records of any entity with filters, sort, cursor pagination, field selection and related data. | **entity**, where, q, sort, fields, include, cursor, limit |
| `update_record` | Partial update of any record: only the fields you pass change. | **entity**, **id**, **data**, dry_run |

### Ownership

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `claim_owner` | Takes ownership of a company, a lead or a client contact, so other agents and people know it is yours. | **entity**, **id**, reason, duration_days, owner_id, force |
| `get_owner` | Who owns a company, lead or client contact right now (human or agent), since when, why, until when, plus the ownership history. | **entity**, **id** |
| `release_owner` | Releases your ownership of a company, lead or client contact (only the owner or an admin can). | **entity**, **id**, reason |

### Presentations and push

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `create_presentation` | Records that a candidate was presented (pushed) to a company. | **candidat_id**, **entreprise_id**, client_id, mandat_id, lead_id, channel, status, candidate_consent, anonymous, cv_url, note, presented_at |
| `get_candidate_push_status` | Can this candidate be pushed, and where was he or she already pushed? status: not_ready (missing CV or CV consent, see missing), ready (never presented), pushed (presented at least once), placed. | **candidat_id** |
| `is_candidate_presented` | Has this candidate already been presented to this company? Always check before pushing a profile to a company. | **candidat_id**, entreprise_id, company_name |
| `list_presentations` | Lists presentations, newest first, filtered by candidate, company, lead, mandate, status or date. | candidat_id, entreprise_id, lead_id, mandat_id, status, since, limit |
| `update_presentation` | Updates a presentation: status (ENVOYEE, SANS_REPONSE, INTERESSE, ENTRETIEN, REFUSEE, EMBAUCHE (sent, no answer, interested, interview, declined, hired)), channel, candidate consent, anonymous, cv_url, note, contact. | **id**, status, channel, candidate_consent, anonymous, cv_url, note, client_id |

### Candidates

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `add_candidate_debrief` | Adds an interview debrief to a candidate record (Interviews tab). | **candidate_id**, title, text, pdf_url, pdf_base64 |
| `add_candidate_to_mandate` | Adds a candidate to a mandate pipeline. | **candidate_id**, **mandate_id**, stage |
| `apply_candidate_debrief` | Applies the proposal of a stored debrief (see add_candidate_debrief / list_candidate_debriefs). | **candidate_id**, **debrief_id**, apply_fields, apply_experiences, apply_client_dossier |
| `bulk_move_candidate_stage` | Moves several applications to the same stage in one call (like the multi-select move of the pipeline): history and notifications as with move_candidate_stage. | **candidature_ids**, **new_stage**, motif_refus, motif_refus_detail |
| `create_candidate` | Creates a new candidate in the ATS. | **nom**, prenom, email, telephone, posteActuel, entrepriseActuelle, localisation, linkedin_url, photo_url, salaire, source, tags, mandate_id, stage |
| `delete_candidate` | Deletes a candidate (moves it to the trash with its notes and applications for 30 days; restore_record brings everything back). | **candidate_id** |
| `find_duplicates` | Lists likely duplicates. | **entity** |
| `get_candidate` | Gets the full candidate record: details, experience, linked mandates, latest activity. | candidate_id, candidate_name |
| `get_candidate_dossier` | Reads the client dossier of a candidate: what the client sees on the portal (photo, summary, info cards, fit for the role, sections such as Background). | **candidate_id** |
| `get_cv_upload_link` | Use when the recruiter wants to upload a CV they have at hand (file attached to the conversation, on their computer or phone). | candidate_id |
| `get_meeting_cv_stats` | Meetings booked, meetings held (read from Google Meet attendance or confirmed by hand), no-shows, cancelled, to confirm, upcoming, and CVs sent to clients, per team member and team total. | period, from, to, user_id, user_email, user_name |
| `list_candidate_debriefs` | Lists the interview debriefs stored on a candidate record (Interviews tab), with the proposed update and its status (propose = to review, applique = applied, erreur = error). | **candidate_id** |
| `match_candidate_to_profiles` | For an S-Tier, A-tier or A-Player candidate, lists the target profiles that fit, with the reasons (Engineering: shared technos, seniority, location/remote; Sales: client type, buyer, cycle, motion). | **candidate_id** |
| `merge_candidates` | Merges two duplicate candidate records (open to all recruiters). | **primary_id**, **duplicate_id**, confirm |
| `move_candidate_stage` | Moves a candidate to another stage in a mandate pipeline. | **candidature_id**, **new_stage**, motif_refus, motif_refus_detail, date_entretien_client, interlocuteur_client, brief_client, fee_montant_facture, date_demarrage, source_placement, source_lead |
| `remove_candidate_from_mandate` | Removes a candidate from a mandate pipeline by moving them to Lost (REFUSE). | **candidature_id**, reason |
| `request_candidate_confirmation` | Emails the candidate to confirm their interest and consent to send their CV to the client (same as the "Ask for confirmation" button). | **candidat_id** |
| `search_candidates` | Searches candidates in the ATS by name, email, job title, company, tags, city or availability. | query, city, source, tags, disponibilite, limit, offset |
| `search_talents_kalent` | Searches profiles in the Kalent database (200M+ profiles) with the team's shared API key. | job_title, location, location_radius_km, skills, companies, excluded_companies, seniority, industries, languages, raw_filters |
| `suggest_candidates_for_mandate` | Looks in the talent pool for candidates who could fit a mandate. | **mandate_id**, title_keywords, city, limit |
| `update_candidate` | Updates a candidate details. | **candidate_id**, nom, prenom, email, linkedinUrl, salaire, disponibilite, posteActuel, entrepriseActuelle, telephone, localisation, tags |
| `update_candidate_dossier` | Updates the client dossier of a candidate (visible to the client on the portal). | **candidate_id**, synthese, infos, adequation, sections, photo_url, show_contact, protect |
| `upload_candidate_cv` | Uploads a CV (PDF, 10 MB max) to a candidate record; it replaces the previous CV and can be downloaded by the client on the portal (emits document.added). | candidate_id, file_url, gmail_message_id, gmail_query, attachment_name, file_base64, filename, update_profile |

### Mandates and pipeline

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `assign_mandate` | Assigns the pair working a mandate: the SALES (owns the client side) and/or the RECRUITER (sources candidates). | mandate_id, mandate_name, sales, recruteur, clear_sales, clear_recruteur |
| `create_job_offer` | Creates a job board offer (read by the website through the public API). | **titre**, **description**, entreprise_nom, localisation, contract_type, remote, salaire_min, salaire_max, secteur, tags, published |
| `create_mandate` | Creates a new mandate (open to every role). | **titrePoste**, **entrepriseId**, clientId, description, localisation, salaireMin, salaireMax, feePourcentage, priorite |
| `delete_mandate` | Deletes a mandate. | **id**, dry_run |
| `duplicate_mandate` | Duplicates a mandate (same company, contact, salary, fee, description) as a new open mandate titled "<title> (copie)", without its candidates. | **id** |
| `generate_contract` | Generates the HumanUp recruitment services agreement (success-fee contract) as a PDF and returns a download link. | mandate_id, mandate_name, company_id, company_name, preview, language, fee_percent, payment_terms, country, guarantee_months, ownership_months, signatory_name, signatory_email, address, registration, job_title, special_conditions, exception_reason, discount_reason |
| `get_mandate` | Gets the full mandate record with pipeline, stats, client and fees. | mandate_id, mandate_name |
| `get_mandate_pipeline` | Gets the full pipeline of a mandate: candidates grouped by stage (keys are stage codes, see stage_labels for the English names). | **mandate_id** |
| `list_contract_approvals` | Admins only. | (none) |
| `list_job_offers` | Lists job board offers (published and drafts). | (none) |
| `move_lead_stage` | Moves a lead forward in the follow-up pipeline (nouveau -> contacte -> r1..r7 -> rdv). | **lead_id**, **stage** |
| `publish_job_offer` | Publishes or unpublishes a job board offer. | **offer_id**, **published** |
| `review_contract_approval` | Admins only. | **approval_id**, **decision**, note |
| `search_mandates` | Searches mandates by title, company, client or status. | query, status, limit |
| `update_mandate` | Updates a mandate like the edit form of the web app: title, status (OUVERT, EN_COURS, GAGNE, PERDU, ANNULE, CLOTURE), priority, salary range (the estimated fee is recalculated), fee %, description, job description (ficheDePoste), team (assignedToId, recruteurId, salesId, sourceurId)… Won (GAGNE)… | **id**, **data** |

### Companies and target profiles

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `create_company` | Creates a new company. | **nom**, secteur, localisation, siteWeb, taille, linkedinUrl |
| `delete_company` | Deletes a company. | **id**, dry_run |
| `get_company` | Gets a company's full record with its contacts and mandates. | company_id, company_name |
| `get_company_target_profiles` | Lists a company's target profiles (Engineering and Sales) with its profiles summary. | **company_id** |
| `merge_companies` | Merges two duplicate company records (admins only). | **primary_id**, **duplicate_id**, confirm |
| `search_companies` | Searches companies in the ATS by name, sector, city or size. | **query**, city, sector, limit |
| `search_target_profiles` | Searches target profiles across all companies. | q, fonction, seniorite, technos, segments, secteurs, motion, cycle_de_vente, marche, pays, remote, date_from, date_to, company_id, mandat_lie_id, page, per_page |
| `set_company_profiles_summary` | Sets the 2-3 line summary of what a company is hiring ("Cherche : ... | **company_id**, **resume_profils** |
| `update_company` | Updates a company's details. | **company_id**, nom, secteur, localisation, siteWeb, linkedinUrl, taille, notes |
| `upsert_target_profile` | Creates or replaces a target profile (the kind of person a company is hiring, deduced from its job ads). | **company_id**, **fonction**, **intitule_type**, seniorite, pays, ville, remote, langues, salaire_min, salaire_max, devise, ote, equity, marche, offres_sources, date_analyse, analyse_par, mandat_lie_id, type_lien, experience_attendue, technos, perimetre, projets, segments, secteurs, acheteur_type, cycle_de_vente, panier_moyen_acv, motion, territoire, quota, outils_methodo |

### Client contacts and portal

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `create_client` | Creates a new client (company contact) in the ATS. | **nom**, prenom, email, telephone, titre, entrepriseId, linkedinUrl, photo_url, roleContact, statutClient |
| `delete_client` | Deletes a client contact. | **id**, dry_run |
| `get_client` | Gets a client's full record with their mandates and latest activity. | client_id, client_name |
| `grant_portal_access` | Grants (or reactivates) a client contact's access to the client portal of a mandate. | mandate_id, mandate_name, email, contact_name, send_invite |
| `list_portal_accesses` | Lists the client portal accesses of a mandate: who can log in, last login, revoked accesses. | mandate_id, mandate_name |
| `merge_clients` | Merges two duplicate client contact records (admins only). | **primary_id**, **duplicate_id**, confirm |
| `revoke_portal_access` | Revokes a contact's access to the client portal of a mandate (admins only). | access_id, mandate_id, mandate_name, email |
| `search_clients` | Searches clients (company contacts) in the ATS by name, email, company or status. | **query**, statut, limit |
| `update_client` | Updates a client's details. | **client_id**, nom, prenom, email, telephone, titre, linkedinUrl, statutClient, roleContact, notes |

### Leads (sales prospecting)

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `add_lead_interaction` | Logs an interaction or follow-up on a lead (call, email, note) and updates the last contact date. | **lead_id**, **text**, type |
| `convert_lead` | Converts a won lead into a CLIENT (plus company). | **lead_id** |
| `create_lead` | Creates a prospecting lead (a company to approach). | **company**, **contact**, role, city, source, stage |
| `delete_lead` | Deletes a lead. | **id**, dry_run |
| `get_lead` | Gets a lead with its interactions (calls, emails, notes). | **id** |
| `list_leads` | Lists prospecting leads (the sales follow-up pipeline), with their opportunity value (positions × average package × 22 %, null when either is missing). | stage, query, owner_id, sort, limit |
| `lose_lead` | Marks a lead as LOST with a reason. | **lead_id**, **motif**, note |
| `update_lead` | Partial update of a lead (company, contact, role, email, phone, city, sector, headcount, source, ownerId, entrepriseId…). | **id**, **data**, dry_run |

### Tasks, meetings, notes, calls

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `add_note` | Adds a note to a candidate, client contact, company or mandate record. | **entity_type**, **entity_id**, **note** |
| `click_to_call` | Starts a phone call through Allo VoIP. | **phone_number**, contact_name, contact_id, contact_type |
| `complete_task` | Marks a task as done. | **task_id** |
| `create_rdv` | Creates a client meeting: the event in Google Calendar (if connected) plus a MEETING activity in the ATS. | **titre**, **date**, duree, client_id, client_name, description, lieu, attendees |
| `create_task` | Creates a new task. | **titre**, contenu, entiteType, entiteId, tacheDueDate, tachePriority |
| `get_call_brief` | Builds a pre-call brief for a contact from the ATS context (latest interactions, mandates, notes). | **contact_id**, **contact_type** |
| `get_call_notes` | Details of a Humanup Notes call: notes written after the call, questions and answers, alerts, Propium records created or updated. | **call_id**, include_transcript |
| `get_my_calendar` | Gets the user's calendar events for today or a given date. | date |
| `get_my_tasks` | Gets the user's tasks: overdue, today, this week, by priority. | status |
| `list_call_notes` | Lists the video calls (Google Meet / Teams) recorded by Humanup Notes: type, status, attendees, Propium links. | from, to, call_type, status, candidat_id, client_id, mandat_id, limit |
| `list_relances_todo` | Lists the user's candidates with no activity for N days (default 7), most urgent first. | days_since_last_activity, limit, entity_type |
| `list_tasks` | Lists tasks of the whole team (get_my_tasks only shows yours), with filters. | status, assignee_id, entite_type, entite_id, cursor, limit |
| `update_task` | Changes a task: title, content, due date, assignee (userId), done / not done. | **id**, **data**, dry_run |
| `validate_call_analysis` | Approves or edits the AI analysis of a call. | **validation_id**, approve_updates, approve_tasks, field_corrections |

### Email and SMS

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `get_my_emails` | Gets the latest emails sent or received that are linked to ATS contacts. | limit |
| `send_email` | Sends an email through Gmail from the user's account. | **to_email**, **subject**, **body**, entity_type, entity_id, mandate_id |
| `send_sms` | Sends an SMS from your Allo line to a candidate or client, and logs it in their Messages thread. | **to_phone**, **message**, entite_type, entite_id |

### Enrichment and external search

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `enrich_contact` | Enriches a candidate or client through FullEnrich. | **enrich_type**, candidate_id, client_id, linkedin_url, first_name, last_name, company_name, company_domain, auto_update |
| `get_enrich_credits` | Checks the remaining FullEnrich credit balance. | (none) |
| `search_people_external` | Searches EXTERNAL contacts (outside the ATS) through FullEnrich. | job_titles, company_names, company_domains, locations, skills, seniority, limit |

### Stats and team

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `get_my_stats` | Gets the user's stats for a period: calls, meetings, candidates, mandates, placements. | period |
| `get_recruiter_stats` | Stats for one recruiter over a period: calls (total and average per working day), new opportunities, closed mandates, candidate presentations, closed deals. | user_email, user_id, user_name, period |
| `get_team_brief` | Full team brief for the day or week. | period |
| `get_team_daily_report` | Daily activity report per person (standup): business overview (active and dormant mandates, candidates in process, open offers, presentations this week, placements and revenue this month), yesterday's events (offers and presentations with candidate, mandate, recruiter, contact), and activity per… | date |
| `get_team_stats` | Gets stats for the whole team. | period |
| `list_team` | Lists the team members who can be assigned to a mandate (sales or recruiter), with their UUID. | (none) |

### Webhooks

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `create_webhook` | Subscribes a URL to events: Propium POSTs each event as JSON (same shape as get_events) with the headers X-Propium-Event and X-Propium-Signature: sha256=<HMAC of the raw body with the secret>. | **url**, event_types, description |
| `delete_webhook` | Deletes a webhook (no more deliveries). | **id** |
| `list_webhooks` | Lists the outgoing webhooks (URL, subscribed event types, last delivery status). | (none) |
| `test_webhook` | Sends a test event (type webhook.test) to a webhook right now and returns the HTTP status, to check the URL and your signature verification. | **id** |
| `update_webhook` | Changes a webhook: URL, event types, description, or active (false pauses it; true resumes it and resets the failure counter). | **id**, url, event_types, description, active |

### Other

| Tool | Use it to | Parameters (bold = required) |
|---|---|---|
| `export_database` | Export the database. Blocked over MCP. | reason |
| `get_analytics` | Everything on the Analytics page for one team member (default: you) over a period: calls, meetings, candidates, mandates, won revenue and presentation rate with trend vs previous period, meetings by type, pipeline funnel by stage, revenue billed per month; plus the team leaderboard (placements,… | period, user_id, user_email, user_name |
| `list_meetings_to_confirm` | Finished meetings whose attendance could not be read from Google Meet (client-created Meet link, no Meet link, nobody joined, or Meet access not yet granted). | user_id, user_email, user_name |
| `modify_settings` | Change system settings. Blocked over MCP. | reason |
| `set_meeting_status` | Record whether a meeting took place: HELD, NO_SHOW or CANCELLED. | **meeting_id**, **status** |
