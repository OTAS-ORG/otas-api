const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Client = require('../models/Client');
const sendResponse = require('../utils/response');

exports.getDashboard = async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const [
      revenueByMonth,
      revenueByType,
      invoiceStatusCounts,
      paymentStatusCounts,
      expenseByMonth,
      expenseCategoryBreakdown,
      clientPipeline,
      clientSourceChannels,
      topClientsByRevenue,
      totalClients,
      grandRevenue,
      grandExpenses,
    ] = await Promise.all([
      // Revenue by month — grandTotal (amount + platformFee + additionalCharges), USD converted to MMK
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          grandTotalAmount: {
            $add: [
              '$amount',
              { $ifNull: ['$platformFee', 0] },
              { $reduce: { input: { $ifNull: ['$additionalCharges', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] } } }
            ]
          }
        }},
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$grandTotalAmount', { $ifNull: ['$exchangeRate', 0] }] },
              '$grandTotalAmount'
            ]
          }
        }},
        { $group: { _id: { month: { $month: '$date' } }, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),

      // Revenue by type — grandTotal, MMK converted
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          grandTotalAmount: {
            $add: [
              '$amount',
              { $ifNull: ['$platformFee', 0] },
              { $reduce: { input: { $ifNull: ['$additionalCharges', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] } } }
            ]
          }
        }},
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$grandTotalAmount', { $ifNull: ['$exchangeRate', 0] }] },
              '$grandTotalAmount'
            ]
          }
        }},
        { $group: { _id: '$type', total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
      ]),

      // Invoice status counts
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Payment status counts
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]),

      // Expense by month — convert USD to MMK using each expense's exchangeRate
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$amount', { $ifNull: ['$exchangeRate', 0] }] },
              '$amount'
            ]
          }
        }},
        { $group: { _id: { month: { $month: '$date' } }, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),

      // Expense category breakdown — MMK converted
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$amount', { $ifNull: ['$exchangeRate', 0] }] },
              '$amount'
            ]
          }
        }},
        { $group: { _id: '$category', total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      // Client pipeline (all time)
      Client.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Client source channels (all time)
      Client.aggregate([
        { $group: { _id: '$sourceChannel', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Top 5 clients by revenue — grandTotal, MMK converted
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          grandTotalAmount: {
            $add: [
              '$amount',
              { $ifNull: ['$platformFee', 0] },
              { $reduce: { input: { $ifNull: ['$additionalCharges', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] } } }
            ]
          }
        }},
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$grandTotalAmount', { $ifNull: ['$exchangeRate', 0] }] },
              '$grandTotalAmount'
            ]
          }
        }},
        { $group: { _id: '$companyName', totalRevenue: { $sum: '$amountMMK' }, invoiceCount: { $sum: 1 } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
      ]),

      // Total clients
      Client.countDocuments(),

      // Grand revenue total — grandTotal, MMK converted
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          grandTotalAmount: {
            $add: [
              '$amount',
              { $ifNull: ['$platformFee', 0] },
              { $reduce: { input: { $ifNull: ['$additionalCharges', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] } } }
            ]
          }
        }},
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$grandTotalAmount', { $ifNull: ['$exchangeRate', 0] }] },
              '$grandTotalAmount'
            ]
          }
        }},
        { $group: { _id: null, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
      ]),

      // Grand expense total — MMK converted
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        { $addFields: {
          amountMMK: {
            $cond: [
              { $eq: ['$currency', 'USD'] },
              { $multiply: ['$amount', { $ifNull: ['$exchangeRate', 0] }] },
              '$amount'
            ]
          }
        }},
        { $group: { _id: null, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
      ]),
    ]);

    const totalRevenue = grandRevenue[0]?.total || 0;
    const totalExpense = grandExpenses[0]?.total || 0;

    sendResponse(res, 200, true, 'Dashboard analytics retrieved successfully', {
      year: targetYear,
      totalRevenueMMK: totalRevenue,
      totalExpenseMMK: totalExpense,
      revenue: {
        byMonth: revenueByMonth,
        byType: revenueByType,
      },
      expenses: {
        byMonth: expenseByMonth,
        categoryBreakdown: expenseCategoryBreakdown,
      },
      invoices: {
        statusCounts: invoiceStatusCounts,
        paymentStatusCounts: paymentStatusCounts,
      },
      clients: {
        total: totalClients,
        pipeline: clientPipeline,
        sourceChannels: clientSourceChannels,
        topByRevenue: topClientsByRevenue,
      },
    });
  } catch (error) {
    console.error('Error in getDashboard:', error);
    sendResponse(res, 500, false, error.message);
  }
};
