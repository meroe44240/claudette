// Agent Hub: routes conversations between people and agents on Humanup Chat.

import { env } from './env.js';
import { migrate, pool } from './db.js';
import { syncConfig } from './sync.js';
import { buildServer } from './server.js';
import { startListeners, stopListeners } from './listener.js';
import { startDelivery } from './delivery.js';
import { ensureSlashCommands } from './mm-integration.js';
import { refreshPlugin } from './guard.js';
import { startScheduler } from './scheduler.js';

async function main() {
  await migrate();
  const synced = await syncConfig();
  console.log(`[hub] config: ${synced.humans} people, ${synced.agents} agents`);
  await ensureSlashCommands();
  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  await startListeners();
  startDelivery();
  startScheduler();
  await refreshPlugin(); // the plugin calls back /mm/policy, so after listen
  console.log(`[hub] listening on :${env.PORT}, Mattermost ${env.MM_URL}`);

  const stop = async () => {
    stopListeners();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error('[hub] failed to start:', e);
  process.exit(1);
});
