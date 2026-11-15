const mongoose = require('mongoose');
const User = require('../models/User');
const { runUserCommand } = require('../commands/users');

const main = async (args) => {
  if (args.some((arg) => arg !== '--apply') || args.filter((arg) => arg === '--apply').length > 1) {
    throw new Error('Usage: node scripts/disable-shared-admin.js [--apply]');
  }
  const uri = process.env.MONGODB_URI;
  const actorId = process.env.CEO_ACTOR_ID;
  if (!uri || !mongoose.isObjectIdOrHexString(actorId)) throw new Error('MONGODB_URI and CEO_ACTOR_ID are required');
  if (/[?&]appName=/i.test(uri)) throw new Error('Remove appName from MONGODB_URI');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    const actor = await User.findById(actorId).select('_id roles active');
    if (!actor?.active || !actor.roles.includes('ceo_bd')) throw new Error('CEO actor must be active and have ceo_bd');
    const target = await User.findOne({ username: 'admin' }).select('_id username active');
    if (!target || target.active === false) return console.log('Shared admin is absent or already disabled');
    if (!args.includes('--apply')) return console.log('Dry-run: shared admin would be disabled');
    await runUserCommand({ actor, operation: 'disableUser', userId: target._id.toString() });
    console.log('Shared admin disabled');
  } finally { await mongoose.disconnect(); }
};

if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error('Shared admin migration failed; verify configuration and staging access');
  process.exitCode = 1;
});
module.exports = { main };
