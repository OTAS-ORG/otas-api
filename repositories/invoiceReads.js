const mongoose = require('mongoose');
const { defineAbilityFor } = require('../permissions/ability');
const guarded = require('./guardedRepository');

// Match the pre-existing Invoice virtual without accessing an unguarded model.
const present = (invoice) => ({
  ...invoice,
  id: invoice._id.toString(),
  grandTotal: (invoice.amount || 0) + (invoice.platformFee || 0) +
    (invoice.additionalCharges || []).reduce((sum, charge) => sum + (charge.amount || 0), 0),
});

const listInvoices = async (user, filter = {}) => {
  const rows = await guarded.findMany({ user, ability: defineAbilityFor(user), collection: 'invoices',
    filter, sort: { createdAt: -1 } });
  return rows.map(present);
};

const getInvoice = async (user, id) => {
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  const ability = defineAbilityFor(user);
  const rows = await guarded.findMany({ user, ability, collection: 'invoices',
    filter: { _id: new mongoose.Types.ObjectId(id) } });
  if (!rows.length) return null;
  const invoice = present(rows[0]);
  if (invoice.clientId) {
    const clients = await guarded.findMany({ user, ability, collection: 'clients',
      filter: { _id: invoice.clientId } });
    invoice.clientId = clients[0] ? { ...clients[0], id: clients[0]._id.toString() } : null;
  }
  return invoice;
};

module.exports = { listInvoices, getInvoice, present };
