const app = require('../server');
const { connectDB } = require('../server');

module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
