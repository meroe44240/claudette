// Dépôt de CV par lien (public, protégé par un jeton à durée limitée émis par l'outil MCP get_cv_upload_link).
// Le jeton passe en query string : il est trop long pour un paramètre de chemin Fastify.
import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../../lib/errors.js';
import * as cvUploadService from './cv-upload.service.js';

export default async function cvDepotRouter(fastify: FastifyInstance) {
  const tokenOf = (q: unknown) => {
    const token = (q as { token?: string })?.token;
    if (!token) throw new ValidationError('Lien de dépôt incomplet.');
    return token;
  };

  // GET /public/cv-depot?token= : à qui ce lien est destiné
  fastify.get('/', {
    schema: { description: "Contexte d'un lien de dépôt de CV", tags: ['Candidats'] },
    handler: (request) => cvUploadService.depotContext(tokenOf(request.query)),
  });

  // POST /public/cv-depot?token=&update=1 : envoi du PDF (multipart, champ « file »)
  fastify.post('/', {
    schema: { description: 'Déposer un CV (PDF) via un lien de dépôt', tags: ['Candidats'] },
    handler: async (request) => {
      const token = tokenOf(request.query);
      const data = await request.file();
      if (!data) throw new ValidationError('Aucun fichier envoyé.');
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) chunks.push(chunk);
      if (data.file.truncated) throw new ValidationError('Fichier trop volumineux (10 Mo maximum).');
      const update = ['1', 'true'].includes(String((request.query as { update?: string }).update ?? ''));
      return cvUploadService.depotUpload(token, Buffer.concat(chunks), data.filename, update);
    },
  });
}
