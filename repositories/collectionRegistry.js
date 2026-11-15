// Only explicitly classified collections may be accessed through this repository.
// Classify further collections when their money-free models are implemented.
const COLLECTIONS = Object.freeze({
  invoices: Object.freeze({ moneyClass: 'selling', subject: 'Invoice' }),
  clients: Object.freeze({ moneyClass: 'none', subject: 'InvoiceClient', projection: Object.freeze({ _id: 1, companyName: 1, contactPerson: 1 }) }),
  users: Object.freeze({ moneyClass: 'none', subject: 'PayrollUser', projection: Object.freeze({ _id: 1, username: 1, fullName: 1 }) }),
  salaries: Object.freeze({ moneyClass: 'finance', subject: 'Salary' }),
  expenses: Object.freeze({ moneyClass: 'finance', subject: 'Expense' }),
});
module.exports = { COLLECTIONS };
