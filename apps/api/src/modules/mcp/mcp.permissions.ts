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
  search_clients:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_client:                    { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_companies:              { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_company:                   { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_mandates:               { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_mandate:                   { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_mandate_pipeline:          { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_stats:                  { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_tasks:                  { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_calendar:               { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_emails:                 { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_sequences:              { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_my_booking_links:          { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_call_brief:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  click_to_call:                 { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  suggest_candidates_for_mandate:{ level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_job_applications:          { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_sequence_details:          { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  // Admin only — lecture equipe
  get_team_stats:                { level: 'free', roles: ['ADMIN'] },
  get_team_brief:                { level: 'free', roles: ['ADMIN'] },
  get_recruiter_stats:           { level: 'free', roles: ['ADMIN'] },

  // ═══ CONFIRM — ecriture ═══
  send_email:                    { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_candidate:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_client:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_company:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_mandate:                { level: 'confirm', roles: ['ADMIN'] },
  move_candidate_stage:          { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  add_candidate_to_mandate:      { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_task:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  create_rdv:                    { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  complete_task:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  start_sequence:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  pause_sequence:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  add_note:                      { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_candidate:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_client:                 { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_company:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  remove_candidate_from_mandate: { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  validate_call_analysis:        { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ PUSHES ═══
  list_pushes:                   { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_push_gmail_status:         { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_push_stats:                { level: 'free', roles: ['ADMIN'] },
  create_push:                   { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  update_push_status:            { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ AUTO-PUSH (3-step flow) ═══
  auto_push_scan:                { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  auto_push_enrich:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  auto_push_execute:             { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ ENRICHISSEMENT ═══
  enrich_contact:                { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  search_people_external:        { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },
  get_enrich_credits:            { level: 'free', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ DELETE (avec confirmation) ═══
  delete_candidate:              { level: 'confirm', roles: ['ADMIN', 'MANAGER', 'RECRUTEUR'] },

  // ═══ BLOCKED — destructif ═══
  delete_client:                 { level: 'blocked', roles: [] },
  delete_mandate:                { level: 'blocked', roles: [] },
  delete_company:                { level: 'blocked', roles: [] },
  export_database:               { level: 'blocked', roles: [] },
  modify_settings:               { level: 'blocked', roles: [] },
};

export function getToolPermission(toolName: string): ToolPermission {
  return TOOL_PERMISSIONS[toolName] || { level: 'blocked', roles: [] };
}

export function checkToolAccess(toolName: string, userRole: Role): { allowed: boolean; level: PermissionLevel; reason?: string } {
  const perm = getToolPermission(toolName);
  if (perm.level === 'blocked') {
    return { allowed: false, level: 'blocked', reason: 'Cette action est interdite via MCP pour des raisons de securite.' };
  }
  if (!perm.roles.includes(userRole)) {
    return { allowed: false, level: perm.level, reason: `Role ${userRole} n'a pas acces a cet outil.` };
  }
  return { allowed: true, level: perm.level };
}
