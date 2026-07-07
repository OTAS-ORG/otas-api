const Contact = require('../models/Contact');
const sendResponse = require('../utils/response');

const submitContact = async (req, res) => {
  try {
    const { name, phone, serviceType, details } = req.body;

    if (!name || !serviceType || !details) {
      return res.status(400).json({ success: false, message: 'Name, service type, and details are required' });
    }

    const contact = await Contact.create({ name, phone, serviceType, details });
    return sendResponse(res, 201, true, 'Contact form submitted successfully', contact);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getContacts = async (req, res) => {
  try {
    const { status, serviceType, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (serviceType) filter.serviceType = serviceType;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Contact.countDocuments(filter);
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return sendResponse(res, 200, true, 'Contacts fetched', {
      contacts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    return sendResponse(res, 200, true, 'Contact fetched', contact);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateContact = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;

    const contact = await Contact.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    return sendResponse(res, 200, true, 'Contact updated', contact);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    return sendResponse(res, 200, true, 'Contact deleted');
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = { submitContact, getContacts, getContact, updateContact, deleteContact };
