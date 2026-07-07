const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const clientRoutes = require('./routes/clientRoutes');
const formRoutes = require('./routes/formRoutes');
const publicRoutes = require('./routes/publicRoutes');
const authRoutes = require('./routes/authRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const aiRoutes = require('./routes/aiRoutes');
const contactRoutes = require('./routes/contactRoutes');
const User = require('./models/User');
const Department = require('./models/Department');
const seedFormConfigs = require('./seeders/formConfigSeeder');
const { initBot, getBot, processTicketCallback, processTaskCallback } = require('./services/telegramService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/clients', clientRoutes);
app.use('/api/client-form', formRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/passwords', passwordRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/contacts', contactRoutes);

// Telegram Bot Webhook endpoint
// Telegram sends POST requests here with update payloads
// Handler is awaited before response so Vercel won't kill the function mid-processing
app.post('/api/telegram/webhook', async (req, res) => {
  const bot = getBot();
  if (!bot) return res.sendStatus(200);

  try {
    const { callback_query } = req.body;
    if (callback_query?.data) {
      if (callback_query.data.startsWith('ticket:')) {
        await processTicketCallback(callback_query, bot);
      } else if (callback_query.data.startsWith('task:')) {
        await processTaskCallback(callback_query, bot);
      }
    }
  } catch (error) {
    console.error('Telegram webhook error:', error);
  }

  res.sendStatus(200);
});

// Database Connection & Seeder
const connectDB = async () => {
  try {
    if (mongoose.connection.readyState >= 1) return;
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Seed default admin if no users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await User.create({
        username: 'admin',
        password: 'password123',
        role: 'Admin'
      });
      console.log('Default admin user created');
    }

    // Seed default departments if none exist
    const deptCount = await Department.countDocuments();
    if (deptCount === 0) {
      await Department.insertMany([
        { name: 'IT' },
        { name: 'HR' },
        { name: 'Sales' },
        { name: 'Finance' },
        { name: 'BD' },
        { name: 'PD' },
        { name: 'DQA' },
        { name: 'Marketing' },
      { name: 'Design' }
      ]);
      console.log('Default departments created');
    }

    // Auto-assign departments to users based on username (if not already assigned)
    const userDeptMap = {
      'admin': ['IT'],
      'TSO': ['BD', 'Finance'],
      'HOW': ['Design'],
      'HHA': ['Marketing'],
      'WTDM': ['DQA'],
      'Aung Aung Oo': ['BD'],
      'yaemyintthu': ['Sales']
    };
    for (const [username, deptNames] of Object.entries(userDeptMap)) {
      for (const deptName of deptNames) {
        const dept = await Department.findOne({ name: deptName });
        if (dept) {
          await User.updateMany(
            { username, departments: { $ne: dept._id } },
            { $addToSet: { departments: dept._id } }
          );
        }
      }
    }

    // Seed default onboarding form configs
    await seedFormConfigs();
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
};

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    initBot();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

// Export for Vercel
module.exports = app;
module.exports.connectDB = connectDB;
