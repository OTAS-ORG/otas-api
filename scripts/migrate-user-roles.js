const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { ROLES } = require('../permissions/roles');

const normalizeRoles = (roles) => ROLES.filter((role) => roles.includes(role));

const validateMapping = (mapping) => {
  if (!Array.isArray(mapping) || mapping.length === 0) {
    throw new Error('Mapping must be a non-empty array');
  }
  const usernames = new Set();
  for (const entry of mapping) {
    if (!entry || typeof entry.username !== 'string' || !entry.username.trim() ||
        entry.username !== entry.username.trim()) {
      throw new Error('Every mapping needs an exact, non-empty username');
    }
    if (usernames.has(entry.username)) throw new Error('Duplicate username in mapping');
    usernames.add(entry.username);
    if (!Array.isArray(entry.roles) || entry.roles.length === 0 ||
        entry.roles.some((role) => !ROLES.includes(role)) ||
        new Set(entry.roles).size !== entry.roles.length) {
      throw new Error('Every mapping needs unique roles from the approved role list');
    }
    if (Object.keys(entry).some((key) => !['username', 'roles'].includes(key))) {
      throw new Error('Mapping entries only accept username and roles');
    }
  }
  return mapping;
};

const planMigration = (mapping, users) => {
  validateMapping(mapping);
  const byUsername = new Map(users.map((user) => [user.username, user]));
  return mapping.map(({ username, roles }) => {
    const user = byUsername.get(username);
    if (!user) throw new Error(`Mapped user not found: ${username}`);
    const tokenVersion = user.tokenVersion === undefined ? 0 : user.tokenVersion;
    if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
      throw new Error(`Invalid stored token version: ${username}`);
    }
    for (const field of ['active', 'mustChangePassword']) {
      if (user[field] !== undefined && typeof user[field] !== 'boolean') {
        throw new Error(`Invalid stored ${field}: ${username}`);
      }
    }
    const nextRoles = normalizeRoles(roles);
    const currentRoles = user.roles;
    const rolesChanged = !Array.isArray(currentRoles) ||
      currentRoles.length !== nextRoles.length ||
      !nextRoles.every((role) => currentRoles.includes(role));
    const set = {};
    if (rolesChanged) {
      if (!Number.isSafeInteger(tokenVersion + 1)) throw new Error('Token version exhausted');
      set.roles = nextRoles;
      set.tokenVersion = tokenVersion + 1;
    } else if (user.tokenVersion === undefined) {
      set.tokenVersion = 0;
    }
    if (user.active === undefined) set.active = true;
    if (user.mustChangePassword === undefined) set.mustChangePassword = false;
    return { id: user._id, username, before: {
      roles: user.roles, active: user.active,
      tokenVersion: user.tokenVersion, mustChangePassword: user.mustChangePassword,
    }, set, changed: Object.keys(set).length > 0 };
  });
};

const parseArgs = (args) => {
  const options = { apply: false, staffRolesApproved: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--apply') options.apply = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--staff-roles-approved') options.staffRolesApproved = true;
    else if (['--config', '--users-fixture'].includes(flag)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag === '--config' ? 'config' : 'fixture'] = args[++i];
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.config) throw new Error('--config is required');
  if (options.apply && options.dryRun) throw new Error('--apply conflicts with --dry-run');
  if (options.apply && !options.staffRolesApproved) throw new Error('Apply requires E-1 approval: --staff-roles-approved');
  if (options.apply && options.fixture) throw new Error('Fixtures are only allowed in dry-run mode');
  return options;
};

const migrate = async ({ mapping, collection, session, apply = false }) => {
  validateMapping(mapping);
  const users = await collection.find(
    { username: { $in: mapping.map((entry) => entry.username) } },
    { session, projection: { _id: 1, username: 1, roles: 1, active: 1, tokenVersion: 1, mustChangePassword: 1 } }
  ).toArray();
  const plan = planMigration(mapping, users);
  if (apply) {
    if (!session || !session.inTransaction()) throw new Error('Apply requires an active transaction');
    for (const item of plan.filter((item) => item.changed)) {
      const result = await collection.updateOne(
        { _id: item.id }, { $set: { ...item.set, updatedAt: new Date() } }, { session }
      );
      if (result.matchedCount !== 1) throw new Error('User changed during migration; transaction aborted');
    }
  }
  return plan;
};

const readJson = async (filename) => JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'));

const main = async (args) => {
  const options = parseArgs(args);
  const mapping = validateMapping(await readJson(options.config));
  let plan;
  if (options.fixture) {
    plan = planMigration(mapping, await readJson(options.fixture));
  } else {
    // Never load the Express app or seeders. The target URI must be supplied explicitly.
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is required (not loaded from .env automatically)');
    if (/[?&]appName=/i.test(uri)) throw new Error('Remove appName from MONGODB_URI');
    const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
    try {
      const collection = connection.db.collection('users');
      if (options.apply) {
        const session = await connection.startSession();
        try {
          await session.withTransaction(async () => {
            plan = await migrate({ mapping, collection, session, apply: true });
          });
        } finally {
          await session.endSession();
        }
      } else {
        plan = await migrate({ mapping, collection });
      }
    } finally {
      await connection.close();
    }
  }
  console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run',
    source: options.fixture ? 'fictional-fixture' : 'database',
    changed: plan.filter((item) => item.changed).length, unchanged: plan.filter((item) => !item.changed).length,
    users: plan.map(({ username, before, set, changed }) => ({ username, before, set, changed })),
  }, null, 2));
};

if (require.main === module) {
  (async () => {
    try {
      await main(process.argv.slice(2));
    } catch (error) {
      // Driver errors may contain connection details; do not echo URIs or credentials.
      console.error(error instanceof mongoose.mongo.MongoError ? 'Migration database operation failed' : error.message);
      process.exitCode = 1;
    }
  })();
}

module.exports = { validateMapping, planMigration, parseArgs, migrate, main };
