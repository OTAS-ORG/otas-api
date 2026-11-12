const crypto = require('crypto');
const User = require('../models/User');
const Department = require('../models/Department');

const DEFAULT_DEPARTMENTS = ['IT', 'HR', 'Sales', 'Finance', 'BD', 'PD', 'DQA', 'Marketing', 'Design'];

// One-time username → department mapping. Only applied when SEED_USER_DEPARTMENTS=true,
// so department changes made in the UI are not overwritten on every boot.
const USER_DEPARTMENT_MAP = {
  TSO: ['BD', 'Finance'],
  HOW: ['Design'],
  HHA: ['Marketing'],
  WTDM: ['DQA'],
  'Aung Aung Oo': ['BD'],
  yaemyintthu: ['Sales'],
};

const seedDefaultAdmin = async () => {
  const userCount = await User.countDocuments();
  if (userCount > 0) return;

  const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const password = envPassword || crypto.randomBytes(12).toString('base64url');

  await User.create({ username: 'admin', password, role: 'Admin' });

  if (envPassword) {
    console.log('Default admin user created (password from DEFAULT_ADMIN_PASSWORD)');
  } else {
    console.log(`Default admin user created. Generated password: ${password} — change it after first login.`);
  }
};

const seedDepartments = async () => {
  const deptCount = await Department.countDocuments();
  if (deptCount > 0) return;

  await Department.insertMany(DEFAULT_DEPARTMENTS.map((name) => ({ name })));
  console.log('Default departments created');
};

const seedUserDepartments = async () => {
  if (process.env.SEED_USER_DEPARTMENTS !== 'true') return;

  for (const [username, deptNames] of Object.entries(USER_DEPARTMENT_MAP)) {
    for (const deptName of deptNames) {
      const dept = await Department.findOne({ name: deptName });
      if (dept) {
        await User.updateMany(
          { username, departments: { $ne: dept._id } },
          { $addToSet: { departments: dept._id } },
        );
      }
    }
  }
  console.log('User department mapping applied (SEED_USER_DEPARTMENTS=true)');
};

const seedDefaultData = async () => {
  await seedDefaultAdmin();
  await seedDepartments();
  await seedUserDepartments();
};

module.exports = seedDefaultData;
