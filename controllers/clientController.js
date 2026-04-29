const Client = require('../models/Client');
const AuditLog = require('../models/AuditLog');
const sendResponse = require('../utils/response');

// Helper to create audit log
const createAudit = async (clientId, action, details) => {
  await AuditLog.create({
    clientId,
    action,
    details
  });
};

exports.getClients = async (req, res) => {
  try {
    const { search, status, isPostSale } = req.query;
    let query = {};

    if (isPostSale !== undefined) {
      query.isPostSale = isPostSale === 'true';
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { contactInfo: { $regex: search, $options: 'i' } },
        { projectId: { $regex: search, $options: 'i' } }
      ];
    }

    const clients = await Client.find(query).sort({ updatedAt: -1 });
    sendResponse(res, 200, true, 'Clients retrieved successfully', clients);
  } catch (error) {
    console.error('Error in getClients:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return sendResponse(res, 404, false, 'Client not found');
    
    const auditLogs = await AuditLog.find({ clientId: client._id }).sort({ timestamp: -1 });
    
    sendResponse(res, 200, true, 'Client details retrieved', { client, auditLogs });
  } catch (error) {
    console.error('Error in getClientById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createClient = async (req, res) => {
  try {
    console.log('Creating client with body:', req.body);
    const client = new Client(req.body);
    const savedClient = await client.save();
    
    await createAudit(savedClient._id, 'CREATE', { 
      message: 'Client created'
    });
    
    sendResponse(res, 201, true, 'Client created successfully', savedClient);
  } catch (error) {
    console.error('Error in createClient:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.updateClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return sendResponse(res, 404, false, 'Client not found');

    const oldStatus = client.status;
    
    // Update fields
    Object.assign(client, req.body);
    
    const updatedClient = await client.save();

    // Check for status change for audit log
    if (oldStatus !== updatedClient.status) {
      await createAudit(updatedClient._id, 'STATUS_CHANGE', {
        oldStatus: oldStatus,
        newStatus: updatedClient.status
      });
    } else {
      await createAudit(updatedClient._id, 'UPDATE', {
        changes: req.body
      });
    }

    sendResponse(res, 200, true, 'Client updated successfully', updatedClient);
  } catch (error) {
    console.error('Error in updateClient:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.addConversationLog = async (req, res) => {
  try {
    const { text } = req.body;
    const client = await Client.findById(req.params.id);
    if (!client) return sendResponse(res, 404, false, 'Client not found');

    client.conversationLogs.push({ text });
    await client.save();

    await createAudit(client._id, 'LOG_ADDED', { text });

    sendResponse(res, 200, true, 'Log added successfully', client);
  } catch (error) {
    console.error('Error in addConversationLog:', error);
    sendResponse(res, 400, false, error.message);
  }
};
