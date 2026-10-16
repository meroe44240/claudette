#!/usr/bin/env node
/**
 * Petit serveur MCP local (stdio, sans dépendance) pour l'appli de bureau Claude :
 * envoie à l'ATS Humanup un CV (PDF) présent sur cet ordinateur.
 *
 * Il ne stocke aucun identifiant : il lui faut un lien de dépôt émis par le
 * connecteur ATS (outil get_cv_upload_link), valable 2 heures. Le fichier ne peut
 * partir que vers l'ATS (ats.propium.co), jamais vers une autre adresse.
 *
 * Installation (Claude Desktop → Réglages → Développeur → Modifier la configuration) :
 *   "mcpServers": { "humanup-cv": { "command": "node", "args": ["<chemin>/tools/cv-upload-mcp/server.mjs"] } }
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ALLOWED_HOSTS = new Set(['ats.propium.co', ...(process.env.HUMANUP_ATS_DEV_HOST ? [process.env.HUMANUP_ATS_DEV_HOST] : [])]);
const MAX_SIZE = 10 * 1024 * 1024;

const TOOL = {
  name: 'upload_cv_file',
  description:
    "Envoie a l'ATS Humanup un CV (PDF) present sur cet ordinateur. Demander d'abord un lien de depot au connecteur ATS (outil get_cv_upload_link, avec le candidate_id si le candidat existe deja), puis appeler cet outil avec le chemin complet du fichier et ce lien. Le recruteur n'a alors rien a glisser lui-meme.",
  inputSchema: {
    type: 'object',
    required: ['path', 'upload_url'],
    properties: {
      path: { type: 'string', description: 'Chemin complet du fichier PDF sur cet ordinateur (ex. C:\\Users\\...\\Downloads\\CV Dupont.pdf)' },
      upload_url: { type: 'string', description: 'Le lien upload_page_url renvoye par get_cv_upload_link' },
      update_profile: { type: 'boolean', description: 'Mettre aussi la fiche a jour a partir du CV (ignore si le candidat est cree depuis le CV)' },
    },
  },
};

async function uploadCv({ path: filePath, upload_url: uploadUrl, update_profile: updateProfile }) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Donnez le chemin complet du fichier (chemin absolu).');
  if (!/\.pdf$/i.test(filePath)) throw new Error('Seuls les CV au format PDF sont acceptes.');
  let url;
  try { url = new URL(String(uploadUrl)); } catch { throw new Error('Lien de depot invalide.'); }
  const token = url.searchParams.get('token');
  if (!ALLOWED_HOSTS.has(url.hostname) || !token) throw new Error("Ce lien n'est pas un lien de depot de l'ATS Humanup.");
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`Fichier introuvable : ${filePath}`);
  if (info.size > MAX_SIZE) throw new Error('Fichier trop volumineux (10 Mo maximum).');

  const body = new FormData();
  body.append('file', new Blob([await readFile(filePath)], { type: 'application/pdf' }), path.basename(filePath));
  const target = `${url.origin}/api/v1/public/cv-depot?token=${encodeURIComponent(token)}${updateProfile ? '&update=1' : ''}`;
  const res = await fetch(target, { method: 'POST', body, signal: AbortSignal.timeout(120000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `L'ATS a refuse le fichier (HTTP ${res.status}).`);
  return {
    success: true,
    candidate_id: data.candidatId,
    candidate_name: data.candidat,
    candidate_created: data.created,
    filename: data.filename,
    replaced_previous_cv: data.replaced,
    profile_updated_from_cv: data.profileUpdated,
    candidate_url: data.ficheUrl,
  };
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'humanup-cv', version: '1.0.0' } } });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
  if (method === 'tools/call') {
    if (params?.name !== TOOL.name) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Outil inconnu : ${params?.name}` } });
    try {
      const out = await uploadCv(params.arguments || {});
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out) }] } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] } });
    }
  }
  // Notifications (pas d'id) : rien à répondre. Méthode inconnue avec id : erreur standard.
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Méthode inconnue : ${method}` } });
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  void handle(msg);
});
