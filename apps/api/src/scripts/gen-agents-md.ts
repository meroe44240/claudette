import { writeFileSync } from 'fs';
import path from 'path';
import { buildAgentsMd } from '../modules/mcp/agents-md.js';

// Régénère AGENTS.md à la racine du dépôt depuis les outils MCP enregistrés.
const target = path.resolve(process.cwd(), '../../AGENTS.md');
writeFileSync(target, buildAgentsMd(), 'utf-8');
console.log(`AGENTS.md écrit : ${target}`);
process.exit(0);
