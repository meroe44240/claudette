import { common } from './common';
import { dashboard } from './dashboard';
import { candidats } from './candidats';
import { clients } from './clients';
import { mandats } from './mandats';
import { mandats2 } from './mandats2';
import { taches } from './taches';

// Un fichier par zone de l'interface ; `common` (menu, boutons, statuts partagés) l'emporte en cas de doublon.
export const EN: Record<string, string> = { ...dashboard, ...candidats, ...clients, ...mandats, ...mandats2, ...taches, ...common };
