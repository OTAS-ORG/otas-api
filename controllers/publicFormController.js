const Client = require('../models/Client');
const Submission = require('../models/Submission');
const sendResponse = require('../utils/response');

// GET /api/public/client-info/:id
exports.getPublicClientInfo = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).select('companyName contactPerson');
    if (!client) return sendResponse(res, 404, false, 'Client not found');
    sendResponse(res, 200, true, 'Client info retrieved', client);
  } catch (error) {
    sendResponse(res, 500, false, error.message);
  }
};

// POST /api/public/submit
// Reuse the submit logic but without auth
exports.submitPublicForm = async (req, res) => {
  try {
    const { clientId, formType, submittedBy, formData } = req.body;
    
    const client = await Client.findById(clientId);
    if (!client) return sendResponse(res, 404, false, 'Client not found');

    const submission = new Submission({
      clientId,
      formType,
      submittedBy,
      formData
    });

    const savedSubmission = await submission.save();
    sendResponse(res, 201, true, 'Form submitted successfully', savedSubmission);
  } catch (error) {
    sendResponse(res, 400, false, error.message);
  }
};
