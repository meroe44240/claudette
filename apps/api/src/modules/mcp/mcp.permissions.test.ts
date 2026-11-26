import { describe, it, expect } from 'vitest';
import { checkToolAccess } from './mcp.permissions.js';

describe('finance tools access', () => {
  it('opens get_forecast and override_deal to admins', () => {
    expect(checkToolAccess('get_forecast', 'ADMIN').allowed).toBe(true);
    expect(checkToolAccess('override_deal', 'ADMIN').allowed).toBe(true);
  });
  it('closes them to recruiters and managers', () => {
    expect(checkToolAccess('get_forecast', 'RECRUTEUR').allowed).toBe(false);
    expect(checkToolAccess('get_forecast', 'MANAGER').allowed).toBe(false);
  });
  it('gives finance agents read-only access', () => {
    expect(checkToolAccess('get_forecast', 'RECRUTEUR', true, true)).toMatchObject({ allowed: true, level: 'free' });
    expect(checkToolAccess('override_deal', 'RECRUTEUR', true, true).allowed).toBe(false);
  });
  it('keeps other agents out of finance tools, even admin agents', () => {
    expect(checkToolAccess('get_forecast', 'RECRUTEUR', true, false).allowed).toBe(false);
    expect(checkToolAccess('get_forecast', 'ADMIN', true, false).allowed).toBe(false);
  });
  it('cash tools: finance agents read projection, receivables and invoices, never write', () => {
    for (const t of ['get_cashflow_projection', 'get_receivables', 'list_invoices', 'list_finance_items']) {
      expect(checkToolAccess(t, 'RECRUTEUR', true, true).allowed).toBe(true);
      expect(checkToolAccess(t, 'RECRUTEUR').allowed).toBe(false);
    }
    for (const t of ['upsert_invoice', 'delete_invoice', 'upsert_finance_item', 'delete_finance_item']) {
      expect(checkToolAccess(t, 'RECRUTEUR', true, true).allowed).toBe(false);
      expect(checkToolAccess(t, 'ADMIN')).toMatchObject({ allowed: true, level: 'confirm' });
    }
  });
  it('leaves the other tools unchanged for agents', () => {
    expect(checkToolAccess('get_mandate_pipeline', 'RECRUTEUR', true, false).allowed).toBe(true);
    expect(checkToolAccess('set_candidate_process_step', 'RECRUTEUR').allowed).toBe(true);
  });
});
