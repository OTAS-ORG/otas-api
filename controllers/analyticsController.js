const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Client = require('../models/Client');
const Salary = require('../models/Salary');
const Ticket = require('../models/Ticket');
const Department = require('../models/Department');
const sendResponse = require('../utils/response');

const grandTotalAddFields = [
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
];

const expenseAmountMMK = [
  { $addFields: {
    amountMMK: {
      $cond: [
        { $eq: ['$currency', 'USD'] },
        { $multiply: ['$amount', { $ifNull: ['$exchangeRate', 0] }] },
        '$amount'
      ]
    }
  }},
];

exports.getDashboard = async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    const prevYear = targetYear - 1;
    const prevStart = new Date(prevYear, 0, 1);
    const prevEnd = new Date(prevYear, 11, 31, 23, 59, 59, 999);

    const [
      revenueByMonth,
      revenueByType,
      invoiceStatusCounts,
      paymentStatusCounts,
      expenseByMonth,
      expenseCategoryBreakdown,
      expenseByDepartment,
      clientPipeline,
      clientSourceChannels,
      topClientsByRevenue,
      totalClients,
      grandRevenue,
      grandExpenses,
      salarySummary,
      salaryByMonth,
      ticketByStatus,
      ticketByDepartment,
      totalTickets,
      prevGrandRevenue,
      prevGrandExpenses,
    ] = await Promise.all([
      // Revenue by month
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...grandTotalAddFields,
        { $group: { _id: { month: { $month: '$date' } }, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),

      // Revenue by type
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...grandTotalAddFields,
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

      // Expense by month
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...expenseAmountMMK,
        { $group: { _id: { month: { $month: '$date' } }, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),

      // Expense category breakdown
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...expenseAmountMMK,
        { $group: { _id: '$category', total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      // Expense by department
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...expenseAmountMMK,
        { $group: { _id: { $ifNull: ['$department', 'Unassigned'] }, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
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

      // Top 5 clients by revenue
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...grandTotalAddFields,
        { $group: { _id: '$companyName', totalRevenue: { $sum: '$amountMMK' }, invoiceCount: { $sum: 1 } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
      ]),

      // Total clients
      Client.countDocuments(),

      // Grand revenue total
      Invoice.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...grandTotalAddFields,
        { $group: { _id: null, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
      ]),

      // Grand expense total
      Expense.aggregate([
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        ...expenseAmountMMK,
        { $group: { _id: null, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } },
      ]),

      // Salary summary (total payroll, allowances, deductions)
      Salary.aggregate([
        { $match: { year: targetYear } },
        { $group: {
          _id: null,
          totalNetPay: { $sum: '$netPay' },
          totalBaseSalary: { $sum: '$baseSalary' },
          totalAllowances: { $sum: '$totalAllowances' },
          totalDeductions: { $sum: '$totalDeductions' },
          count: { $sum: 1 },
        }},
      ]),

      // Salary by month
      Salary.aggregate([
        { $match: { year: targetYear } },
        { $group: {
          _id: { month: '$month' },
          totalNetPay: { $sum: '$netPay' },
          totalBaseSalary: { $sum: '$baseSalary' },
          totalAllowances: { $sum: '$totalAllowances' },
          totalDeductions: { $sum: '$totalDeductions' },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.month': 1 } },
      ]),

      // Ticket by status
      Ticket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Ticket by department
      Ticket.aggregate([
        { $lookup: { from: 'departments', localField: 'department_id', foreignField: '_id', as: 'dept' } },
        { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ['$dept.name', 'No Department'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Total tickets
      Ticket.countDocuments(),

      // Previous year grand revenue
      Invoice.aggregate([
        { $match: { date: { $gte: prevStart, $lte: prevEnd } } },
        ...grandTotalAddFields,
        { $group: { _id: null, total: { $sum: '$amountMMK' } } },
      ]),

      // Previous year grand expenses
      Expense.aggregate([
        { $match: { date: { $gte: prevStart, $lte: prevEnd } } },
        ...expenseAmountMMK,
        { $group: { _id: null, total: { $sum: '$amountMMK' } } },
      ]),
    ]);

    const totalRevenue = grandRevenue[0]?.total || 0;
    const totalExpense = grandExpenses[0]?.total || 0;
    const prevRevenue = prevGrandRevenue[0]?.total || 0;
    const prevExpense = prevGrandExpenses[0]?.total || 0;

    sendResponse(res, 200, true, 'Dashboard analytics retrieved successfully', {
      year: targetYear,
      totalRevenueMMK: totalRevenue,
      totalExpenseMMK: totalExpense,
      prevYearRevenueMMK: prevRevenue,
      prevYearExpenseMMK: prevExpense,
      revenue: {
        byMonth: revenueByMonth,
        byType: revenueByType,
      },
      expenses: {
        byMonth: expenseByMonth,
        categoryBreakdown: expenseCategoryBreakdown,
        byDepartment: expenseByDepartment,
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
      payroll: {
        summary: salarySummary[0] || { totalNetPay: 0, totalBaseSalary: 0, totalAllowances: 0, totalDeductions: 0, count: 0 },
        byMonth: salaryByMonth,
      },
      tickets: {
        total: totalTickets,
        byStatus: ticketByStatus,
        byDepartment: ticketByDepartment,
      },
    });
  } catch (error) {
    console.error('Error in getDashboard:', error);
    sendResponse(res, 500, false, error.message);
  }
};
