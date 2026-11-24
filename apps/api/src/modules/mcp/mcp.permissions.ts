import type { Role } from '@prisma/client';

export type PermissionLevel = 'free' | 'confirm' | 'blocked';

interface ToolPermission {
  level: PermissionLevel;
  roles: Role[];
}

export const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  // ═══ FREE — lecture ═══
  get_daily_brief:               { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_candidates:             { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_candidate:                 { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_call_notes:               { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_call_notes:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_candidate_dossier:         { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_cv_upload_link:            { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_candidate_debriefs:       { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_clients:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_client:                    { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_companies:              { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_company:                   { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_mandates:               { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_mandate:                   { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_mandate_pipeline:          { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_team:                     { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_stats:                  { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_tasks:                  { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_calendar:               { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_emails:                 { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_relances_todo:            { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  plan_my_day:                   { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_call_brief:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  click_to_call:                 { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  suggest_candidates_for_mandate:{ level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  // Admin only — lecture equipe
  get_team_stats:                { level: 'free', roles: ['ADMIN'] },
  get_team_brief:                { level: 'free', roles: ['ADMIN'] },
  get_recruiter_stats:           { level: 'free', roles: ['ADMIN'] },
  get_team_daily_report:         { level: 'free', roles: ['ADMIN'] },

  // ═══ CONFIRM — ecriture ═══
  send_email:                    { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_candidate:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_client:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_company:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_mandate:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  assign_mandate:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  move_candidate_stage:          { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  add_candidate_to_mandate:      { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_task:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_rdv:                    { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  complete_task:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  add_note:                      { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_candidate:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_candidate_dossier:      { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  upload_candidate_cv:           { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  add_candidate_debrief:         { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  apply_candidate_debrief:       { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_client:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_company:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  remove_candidate_from_mandate: { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  validate_call_analysis:        { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_job_offers:               { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_job_offer:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  publish_job_offer:             { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  // ═══ LEADS (prospection / relances — sales) ═══
  list_leads:                    { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_lead:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  move_lead_stage:               { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  add_lead_interaction:          { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  lose_lead:                     { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  convert_lead:                  { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  // ═══ PORTAIL CLIENT (acces par mandat) ═══
  list_portal_accesses:          { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  grant_portal_access:           { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  revoke_portal_access:          { level: 'confirm', roles: ['ADMIN'] },
  generate_contract:             { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_contract_approvals:       { level: 'free',    roles: ['ADMIN'] },
  review_contract_approval:      { level: 'confirm', roles: ['ADMIN'] },

  // ═══ FUSION DE DOUBLONS (admin) ═══
  find_duplicates:               { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  merge_candidates:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  merge_clients:                 { level: 'confirm', roles: ['ADMIN'] },
  merge_companies:               { level: 'confirm', roles: ['ADMIN'] },

  // ═══ PROFILS RECHERCHÉS (écriture : admins + comptes agents, contrôlé dans le service) ═══
  get_company_target_profiles:   { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_target_profiles:        { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  match_candidate_to_profiles:   { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  upsert_target_profile:         { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  set_company_profiles_summary:  { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ PUSHES ═══

  // ═══ AUTO-PUSH (3-step flow) ═══

  // ═══ ENRICHISSEMENT ═══
  enrich_contact:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_people_external:        { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_talents_kalent:         { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_enrich_credits:            { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ CORBEILLE ET JOURNAL ═══
  list_trash:                    { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  restore_record:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_record_history:            { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ OUTILS GÉNÉRIQUES (toutes les entités) ═══
  list_records:                  { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_record:                    { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_all:                    { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_record:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_record:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  delete_record:                 { level: 'confirm', roles: ['ADMIN'] },
  bulk_create_records:           { level: 'confirm', roles: ['ADMIN', 'MANAGER'] },
  bulk_update_records:           { level: 'confirm', roles: ['ADMIN', 'MANAGER'] },
  bulk_delete_records:           { level: 'confirm', roles: ['ADMIN'] },
  undo:                          { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  export_records_csv:            { level: 'free',    roles: ['ADMIN'] },
  import_records_csv:            { level: 'confirm', roles: ['ADMIN', 'MANAGER'] },

  // ═══ OUTILS NOMMÉS AJOUTÉS (lot 2) ═══
  get_lead:                      { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_lead:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_mandate:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  duplicate_mandate:             { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  bulk_move_candidate_stage:     { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_tasks:                    { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_task:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  send_sms:                      { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  request_candidate_confirmation:{ level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ PROPRIÉTÉ, PRÉSENTATIONS, PUSH (lot 3) ═══
  claim_owner:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  release_owner:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_owner:                     { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  is_candidate_presented:        { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_presentation:           { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_presentation:           { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_presentations:            { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_candidate_push_status:     { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ ÉVÉNEMENTS, SCHÉMA, WEBHOOKS (lot 4) ═══
  get_events:                    { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  describe_schema:               { level: 'free',    roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  list_webhooks:                 { level: 'free',    roles: ['ADMIN'] },
  create_webhook:                { level: 'confirm', roles: ['ADMIN'] },
  update_webhook:                { level: 'confirm', roles: ['ADMIN'] },
  delete_webhook:                { level: 'confirm', roles: ['ADMIN'] },
  test_webhook:                  { level: 'free',    roles: ['ADMIN'] },

  // ═══ SUPPRESSIONS (vers la corbeille, restaurables 30 jours) ═══
  delete_candidate:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  delete_client:                 { level: 'confirm', roles: ['ADMIN'] },
  delete_mandate:                { level: 'confirm', roles: ['ADMIN'] },
  delete_company:                { level: 'confirm', roles: ['ADMIN'] },
  delete_lead:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER'] },

  // ═══ FORECAST (process d'entretien : ouvert à l'équipe) ═══
  set_mandate_interview_process: { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  set_candidate_process_step:    { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  // ═══ FINANCE (admin ; agents financiers en lecture seule, voir FINANCE_TOOLS) ═══
  get_forecast:                  { level: 'free',    roles: ['ADMIN'] },
  override_deal:                 { level: 'confirm', roles: ['ADMIN'] },

  // ═══ BLOCKED ═══
  export_database:               { level: 'blocked', roles: [] },
  modify_settings:               { level: 'blocked', roles: [] },
};

export function getToolPermission(toolName: string): ToolPermission {
  return TOOL_PERMISSIONS[toolName] || { level: 'blocked', roles: [] };
}

/**
 * Outils financiers : réservés à l'admin. Les agents n'y ont accès que s'ils sont agents financiers
 * (users.acces_finance), et seulement en lecture. Exception à la règle « les agents ont accès à tout ».
 */
export const FINANCE_TOOLS: Record<string, 'read' | 'write'> = {
  get_forecast: 'read',
  override_deal: 'write',
};

export function checkToolAccess(toolName: string, userRole: Role, estAgent = false, accesFinance = false): { allowed: boolean; level: PermissionLevel; reason?: string } {
  const perm = getToolPermission(toolName);
  if (perm.level === 'blocked') {
    return { allowed: false, level: 'blocked', reason: 'This action is not allowed over MCP for security reasons.' };
  }
  const finance = FINANCE_TOOLS[toolName];
  if (finance) {
    if (userRole === 'ADMIN' && !estAgent) return { allowed: true, level: perm.level };
    if (estAgent && accesFinance && finance === 'read') return { allowed: true, level: 'free' };
    return {
      allowed: false,
      level: perm.level,
      reason: estAgent
        ? (accesFinance ? 'Finance agents have read-only access: this tool changes data. Ask an admin.' : 'This finance tool is only available to finance agents. Ask an admin to enable finance access on this agent.')
        : 'This finance tool is only available to admins.',
    };
  }
  // Les agents ont accès à tout ce qui n'est pas bloqué : tout est tracé et réversible.
  if (estAgent) return { allowed: true, level: 'free' };
  if (!perm.roles.includes(userRole)) {
    return { allowed: false, level: perm.level, reason: `This tool is not available to the ${userRole} role. Ask an admin to do it.` };
  }
  return { allowed: true, level: perm.level };
}
