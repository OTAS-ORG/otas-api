const Client = require('../models/Client');
const Submission = require('../models/Submission');
const sendResponse = require('../utils/response');

// POST /api/client-form/submit
exports.submitForm = async (req, res) => {
  try {
    const { clientId, formType, submittedBy, formData } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return sendResponse(res, 404, false, 'Client not found');
    }

    // Check if this form type already exists for this client (optional, depends on use case)
    // For business_email, we might only want one.
    
    const submission = new Submission({
      clientId,
      formType,
      submittedBy,
      formData
    });

    const savedSubmission = await submission.save();
    sendResponse(res, 201, true, 'Form submitted successfully', savedSubmission);
  } catch (error) {
    console.error('Error in submitForm:', error);
    sendResponse(res, 400, false, error.message);
  }
};

// GET /api/clients/:id/data
exports.getClientDashboardData = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await Client.findById(clientId).populate('submissions');
    if (!client) {
      return sendResponse(res, 404, false, 'Client not found');
    }

    sendResponse(res, 200, true, 'Dashboard data retrieved', {
      profile: client,
      submissions: client.submissions || []
    });
  } catch (error) {
    console.error('Error in getClientDashboardData:', error);
    sendResponse(res, 500, false, error.message);
  }
};
