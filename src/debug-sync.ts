import { store } from './db/store';
import { syncFromFindUs } from './services/findus-client';

async function main() {
  const client = await store.getClient('bb07d509-cb8e-491f-bda1-618cfe3fb574');
  console.log('api_config type:', typeof client?.api_config);
  console.log('api_config:', JSON.stringify(client?.api_config));
  console.log('filters type:', typeof client?.api_config?.filters);

  // Simulate what the server sync endpoint does
  try {
    const result = await syncFromFindUs(true, client!.id, client!.api_config as any);
    console.log('OK:', result.properties_fetched, 'props,', result.pipeline);
  } catch(e: any) {
    console.error('ERROR:', e.message);
    // Get deeper stack
    console.error(e.stack?.split('\n').slice(0, 15).join('\n'));
  }
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack?.split('\n').slice(0,10).join('\n')); });
