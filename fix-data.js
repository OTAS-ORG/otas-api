const mongoose = require('mongoose');
require('dotenv').config();
const Client = require('./models/Client');

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/otas-crm');
    console.log('Connected to MongoDB');

    const allClients = await Client.find({});
    console.log(`Total clients in DB: ${allClients.length}`);

    const signedClients = await Client.find({ status: 'Signed' });
    console.log(`Signed clients: ${signedClients.length}`);
    signedClients.forEach(c => {
      console.log(`- ${c.companyName}: isPostSale = ${c.isPostSale}`);
    });

    const postSaleClients = await Client.find({ isPostSale: true });
    console.log(`Clients with isPostSale = true: ${postSaleClients.length}`);

    // If there are signed clients with isPostSale = false, fix them
    const toFix = signedClients.filter(c => !c.isPostSale);
    if (toFix.length > 0) {
      console.log(`Fixing ${toFix.length} clients...`);
      await Client.updateMany({ status: 'Signed', isPostSale: false }, { isPostSale: true });
      console.log('Fix complete.');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkData();
