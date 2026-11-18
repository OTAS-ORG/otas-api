const { MongoClient, ObjectId } = require('mongodb');

// Deliberately do not load .env: callers supply explicitly confirmed staging
// credentials in the process environment. This probe issues only reads of a
// fresh fictional _id, and never prints URIs, usernames, or documents.
const classes = [
  { name: 'BASE', env: 'MONGODB_URI_BASE', allowed: ['clients'], denied: ['invoices', 'salaries', 'expenses', 'supplier_quotes', 'marketing_spend'] },
  { name: 'SELLING', env: 'MONGODB_URI_SELLING', allowed: ['invoices'], denied: ['salaries', 'expenses', 'supplier_quotes', 'marketing_spend'] },
  { name: 'FINANCE', env: 'MONGODB_URI_FINANCE', allowed: ['salaries', 'expenses'], denied: ['invoices', 'supplier_quotes', 'marketing_spend'] },
  { name: 'COST', env: 'MONGODB_URI_COST', allowed: ['supplier_quotes'], denied: ['invoices', 'salaries', 'expenses', 'marketing_spend'] },
  { name: 'MARKETING', env: 'MONGODB_URI_MARKETING', allowed: ['marketing_spend'], denied: ['invoices', 'salaries', 'expenses', 'supplier_quotes'] },
];

function targetKey(client) {
  const o = client.options;
  const hosts = o.srvHost ? [`srv:${o.srvHost.toLowerCase()}`] :
    (o.hosts || []).map(host => host.toString().toLowerCase()).sort();
  if (!hosts.length) throw Error('A MongoDB deployment must be specified');
  return JSON.stringify({ hosts, replicaSet: o.replicaSet || null });
}

async function main() {
  const expectedDb = process.env.OTAS_STAGING_DB_NAME;
  if (!expectedDb || !/(^|[_-])(staging|stage)([_-]|$)/i.test(expectedDb) ||
      process.env.OTAS_STAGING_CONFIRM !== expectedDb) {
    throw Error('Set OTAS_STAGING_DB_NAME to the confirmed staging database name and OTAS_STAGING_CONFIRM to the exact same name. The name must include a separate staging or stage component.');
  }
  const clients = [];
  try {
    let target;
    const identities = new Set();
    for (const item of classes) {
      if (!process.env[item.env]) throw Error(`${item.env} is required`);
      let client;
      try { client = new MongoClient(process.env[item.env], { serverSelectionTimeoutMS: 10000 }); }
      catch { throw Error(`${item.env} is invalid`); }
      clients.push(client);
      if (client.options.dbName !== expectedDb) throw Error(`${item.env} must target the confirmed staging database`);
      const key = targetKey(client);
      if (target && key !== target) throw Error('All class URIs must identify the same deployment');
      target = key;
      const credential = client.options.credentials;
      if (!credential?.username) throw Error(`${item.env} must specify an authenticated identity`);
      const identity = `${credential.source || expectedDb}\0${credential.username}`;
      if (identities.has(identity)) throw Error('Each class must use a separate database identity');
      identities.add(identity);
      item.client = client;
    }
    const fixtureId = new ObjectId();
    const failures = [];
    for (const item of classes) {
      try { await item.client.connect(); }
      catch { failures.push(`${item.name}: connection failed`); continue; }
      for (const [expected, collections] of [['allow', item.allowed], ['deny', item.denied]]) {
        for (const collection of collections) {
          let outcome;
          try {
            await item.client.db(expectedDb).collection(collection).findOne({ _id: fixtureId }, { projection: { _id: 1 } });
            outcome = 'allow';
          } catch (error) {
            outcome = error?.code === 13 || error?.codeName === 'Unauthorized' ? 'deny' : 'error';
          }
          if (outcome === expected) console.log(`PASS ${item.name} ${collection}: ${expected}`);
          else { console.log(`FAIL ${item.name} ${collection}: expected ${expected}, got ${outcome}`); failures.push(`${item.name}/${collection}`); }
        }
      }
    }
    if (failures.length) throw Error(`${failures.length} staging class checks failed`);
    console.log('Read-only class checks passed. Write grants, transactions, row-level isolation, and application behavior were not tested.');
  } finally {
    await Promise.allSettled(clients.map(client => client.close()));
  }
}
main().catch(error => { console.error(`Staging probe failed: ${error.message}`); process.exitCode = 1; });
