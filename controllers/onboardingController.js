const crypto = require('crypto');
const OnboardingToken = require('../models/OnboardingToken');
const OnboardingFormConfig = require('../models/OnboardingFormConfig');
const Client = require('../models/Client');
const Submission = require('../models/Submission');
const sendResponse = require('../utils/response');

exports.generateLink = async (req, res) => {
  try {
    const { clientId, serviceTypes } = req.body;

    if (!clientId || !serviceTypes || !serviceTypes.length) {
      return sendResponse(res, 400, false, 'clientId and serviceTypes are required');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendResponse(res, 404, false, 'Client not found');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const onboardingToken = await OnboardingToken.create({
      clientId,
      token,
      expiresAt,
      serviceTypes,
      createdBy: req.user._id,
    });

    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/onboarding/${token}`;

    sendResponse(res, 201, true, 'Onboarding link generated', {
      link,
      token: onboardingToken._id,
      expiresAt,
      serviceTypes,
    });
  } catch (error) {
    console.error('Error in generateLink:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getFormData = async (req, res) => {
  try {
    const { token } = req.params;

    const onboardingToken = await OnboardingToken.findOne({ token })
      .populate('clientId', 'companyName contactPerson contactInfo email');

    if (!onboardingToken) {
      return sendResponse(res, 404, false, 'Invalid or expired link');
    }

    if (onboardingToken.isCompleted) {
      return sendResponse(res, 400, false, 'This form has already been submitted');
    }

    if (new Date() > onboardingToken.expiresAt) {
      return sendResponse(res, 410, false, 'This link has expired');
    }

    const client = onboardingToken.clientId;
    const services = onboardingToken.serviceTypes || [];

    const formConfigs = await OnboardingFormConfig.find({
      serviceType: { $in: ['general', ...services] },
    }).sort({ sortOrder: 1, serviceType: 1 });

    sendResponse(res, 200, true, 'Form data retrieved', {
      client: {
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        contactInfo: client.contactInfo,
        email: client.email,
      },
      services,
      formConfigs,
      savedFormData: onboardingToken.formData || {},
      expiresAt: onboardingToken.expiresAt,
    });
  } catch (error) {
    console.error('Error in getFormData:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.saveFormData = async (req, res) => {
  try {
    const { token } = req.params;
    const { formData } = req.body;

    const onboardingToken = await OnboardingToken.findOne({ token });
    if (!onboardingToken) {
      return sendResponse(res, 404, false, 'Invalid or expired link');
    }

    if (onboardingToken.isCompleted) {
      return sendResponse(res, 400, false, 'This form has already been submitted');
    }

    if (new Date() > onboardingToken.expiresAt) {
      return sendResponse(res, 410, false, 'This link has expired');
    }

    onboardingToken.formData = { ...onboardingToken.formData, ...formData };
    await onboardingToken.save();

    sendResponse(res, 200, true, 'Form data saved');
  } catch (error) {
    console.error('Error in saveFormData:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.submitForm = async (req, res) => {
  try {
    const { token } = req.params;
    const { formData } = req.body;

    const onboardingToken = await OnboardingToken.findOne({ token })
      .populate('clientId', 'companyName contactPerson');

    if (!onboardingToken) {
      return sendResponse(res, 404, false, 'Invalid or expired link');
    }

    if (onboardingToken.isCompleted) {
      return sendResponse(res, 400, false, 'This form has already been submitted');
    }

    if (new Date() > onboardingToken.expiresAt) {
      return sendResponse(res, 410, false, 'This link has expired');
    }

    const finalData = { ...onboardingToken.formData, ...formData };

    await Submission.create({
      clientId: onboardingToken.clientId._id,
      formType: 'onboarding',
      submittedBy: {
        name: onboardingToken.clientId.contactPerson,
        position: 'Client',
      },
      formData: finalData,
      status: 'Pending',
    });

    onboardingToken.formData = finalData;
    onboardingToken.isCompleted = true;
    onboardingToken.completedAt = new Date();
    await onboardingToken.save();

    sendResponse(res, 200, true, 'Form submitted successfully');
  } catch (error) {
    console.error('Error in submitForm:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getStatus = async (req, res) => {
  try {
    const { clientId } = req.params;

    const tokens = await OnboardingToken.find({ clientId })
      .sort({ createdAt: -1 })
      .select('token serviceTypes expiresAt isCompleted completedAt createdAt');

    sendResponse(res, 200, true, 'Status retrieved', tokens);
  } catch (error) {
    console.error('Error in getStatus:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { sections, serviceName } = req.body;

    const config = await OnboardingFormConfig.findOneAndUpdate(
      { serviceType },
      { sections, serviceName },
      { new: true, upsert: true }
    );

    sendResponse(res, 200, true, 'Form config updated', config);
  } catch (error) {
    console.error('Error in updateConfig:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getConfigs = async (req, res) => {
  try {
    const configs = await OnboardingFormConfig.find().sort({ sortOrder: 1, serviceType: 1 });
    sendResponse(res, 200, true, 'Form configs retrieved', configs);
  } catch (error) {
    console.error('Error in getConfigs:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.cloneConfig = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { newServiceType, newServiceName } = req.body;

    if (!newServiceType || !newServiceName) {
      return sendResponse(res, 400, false, 'newServiceType and newServiceName are required');
    }

    const existing = await OnboardingFormConfig.findOne({ serviceType });
    if (!existing) {
      return sendResponse(res, 404, false, 'Source config not found');
    }

    const duplicate = await OnboardingFormConfig.findOne({ serviceType: newServiceType });
    if (duplicate) {
      return sendResponse(res, 409, false, 'A config with this service type already exists');
    }

    const cloned = await OnboardingFormConfig.create({
      serviceType: newServiceType,
      serviceName: newServiceName,
      sections: JSON.parse(JSON.stringify(existing.sections)),
      sortOrder: existing.sortOrder + 1,
    });

    sendResponse(res, 201, true, 'Config cloned successfully', cloned);
  } catch (error) {
    console.error('Error in cloneConfig:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.exportConfig = async (req, res) => {
  try {
    const { serviceType } = req.params;

    const config = await OnboardingFormConfig.findOne({ serviceType });
    if (!config) {
      return sendResponse(res, 404, false, 'Config not found');
    }

    const exportData = {
      serviceType: config.serviceType,
      serviceName: config.serviceName,
      sections: config.sections,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    sendResponse(res, 200, true, 'Config exported', exportData);
  } catch (error) {
    console.error('Error in exportConfig:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.importConfig = async (req, res) => {
  try {
    const { config: importPayload, overwrite } = req.body;

    if (!importPayload || !importPayload.serviceType || !importPayload.sections) {
      return sendResponse(res, 400, false, 'Invalid config format: serviceType and sections required');
    }

    const existing = await OnboardingFormConfig.findOne({ serviceType: importPayload.serviceType });

    if (existing && !overwrite) {
      return sendResponse(res, 409, false, 'Config already exists. Set overwrite=true to replace.');
    }

    let config;
    if (existing) {
      config = await OnboardingFormConfig.findOneAndUpdate(
        { serviceType: importPayload.serviceType },
        { serviceName: importPayload.serviceName, sections: importPayload.sections },
        { new: true }
      );
    } else {
      config = await OnboardingFormConfig.create({
        serviceType: importPayload.serviceType,
        serviceName: importPayload.serviceName,
        sections: importPayload.sections,
      });
    }

    sendResponse(res, 200, true, 'Config imported successfully', config);
  } catch (error) {
    console.error('Error in importConfig:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.reorderSections = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { orderedSections } = req.body;

    if (!Array.isArray(orderedSections)) {
      return sendResponse(res, 400, false, 'orderedSections must be an array');
    }

    const config = await OnboardingFormConfig.findOne({ serviceType });
    if (!config) {
      return sendResponse(res, 404, false, 'Config not found');
    }

    config.sections = orderedSections;
    await config.save();

    sendResponse(res, 200, true, 'Sections reordered', config);
  } catch (error) {
    console.error('Error in reorderSections:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.reorderFields = async (req, res) => {
  try {
    const { serviceType, sectionIndex } = req.params;
    const { orderedFields } = req.body;

    if (!Array.isArray(orderedFields)) {
      return sendResponse(res, 400, false, 'orderedFields must be an array');
    }

    const config = await OnboardingFormConfig.findOne({ serviceType });
    if (!config) {
      return sendResponse(res, 404, false, 'Config not found');
    }

    if (!config.sections[sectionIndex]) {
      return sendResponse(res, 404, false, 'Section not found');
    }

    config.sections[sectionIndex].fields = orderedFields;
    await config.save();

    sendResponse(res, 200, true, 'Fields reordered', config);
  } catch (error) {
    console.error('Error in reorderFields:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getSubmissions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { formType: 'onboarding' };
    if (status) filter.status = status;

    const total = await Submission.countDocuments(filter);
    const submissions = await Submission.find(filter)
      .populate('clientId', 'companyName contactPerson')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    sendResponse(res, 200, true, 'Submissions retrieved', {
      submissions,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error in getSubmissions:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateSubmissionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Pending', 'Verified', 'Rejected'].includes(status)) {
      return sendResponse(res, 400, false, 'Invalid status');
    }

    const submission = await Submission.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('clientId', 'companyName contactPerson');

    if (!submission) {
      return sendResponse(res, 404, false, 'Submission not found');
    }

    sendResponse(res, 200, true, 'Submission status updated', submission);
  } catch (error) {
    console.error('Error in updateSubmissionStatus:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.deleteToken = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.query;

    const token = await OnboardingToken.findOne({ _id: id, clientId });
    if (!token) {
      return sendResponse(res, 404, false, 'Token not found');
    }

    await OnboardingToken.findByIdAndDelete(id);
    sendResponse(res, 200, true, 'Token deleted');
  } catch (error) {
    console.error('Error in deleteToken:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.deleteConfig = async (req, res) => {
  try {
    const { serviceType } = req.params;

    if (serviceType === 'general') {
      return sendResponse(res, 400, false, 'Cannot delete the general config');
    }

    const config = await OnboardingFormConfig.findOneAndDelete({ serviceType });
    if (!config) {
      return sendResponse(res, 404, false, 'Config not found');
    }

    sendResponse(res, 200, true, 'Config deleted');
  } catch (error) {
    console.error('Error in deleteConfig:', error);
    sendResponse(res, 500, false, error.message);
  }
};
