const PasswordVault = require('../models/PasswordVault');
const sendResponse = require('../utils/response');
const { encrypt, decrypt } = require('../utils/encryption');

exports.getPasswords = async (req, res) => {
  try {
    const { clientId, search, category } = req.query;
    const query = {};

    if (clientId) query.clientId = clientId;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const passwords = await PasswordVault.find(query)
      .populate('clientId', 'companyName contactPerson')
      .populate('createdBy', 'username')
      .sort({ updatedAt: -1 });

    sendResponse(res, 200, true, 'Passwords retrieved successfully', passwords);
  } catch (error) {
    console.error('Error in getPasswords:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getPasswordById = async (req, res) => {
  try {
    const password = await PasswordVault.findById(req.params.id)
      .populate('clientId', 'companyName contactPerson')
      .populate('createdBy', 'username');

    if (!password) {
      return sendResponse(res, 404, false, 'Password entry not found');
    }

    sendResponse(res, 200, true, 'Password retrieved successfully', password);
  } catch (error) {
    console.error('Error in getPasswordById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createPassword = async (req, res) => {
  try {
    const { clientId, name, url, username, password, category, notes } = req.body;

    if (!name || !password) {
      return sendResponse(res, 400, false, 'name and password are required');
    }

    const encrypted = encrypt(password);

    const newEntry = await PasswordVault.create({
      clientId,
      name,
      url,
      username,
      encryptedPassword: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      category: category || 'other',
      notes,
      createdBy: req.user._id,
    });

    const populated = await PasswordVault.findById(newEntry._id)
      .populate('clientId', 'companyName contactPerson')
      .populate('createdBy', 'username');

    sendResponse(res, 201, true, 'Password created successfully', populated);
  } catch (error) {
    console.error('Error in createPassword:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { name, url, username, password, category, notes } = req.body;

    const entry = await PasswordVault.findById(req.params.id);
    if (!entry) {
      return sendResponse(res, 404, false, 'Password entry not found');
    }

    if (name) entry.name = name;
    if (url !== undefined) entry.url = url;
    if (username !== undefined) entry.username = username;
    if (category) entry.category = category;
    if (notes !== undefined) entry.notes = notes;

    if (password) {
      const encrypted = encrypt(password);
      entry.encryptedPassword = encrypted.encryptedData;
      entry.iv = encrypted.iv;
      entry.authTag = encrypted.authTag;
    }

    await entry.save();

    const populated = await PasswordVault.findById(entry._id)
      .populate('clientId', 'companyName contactPerson')
      .populate('createdBy', 'username');

    sendResponse(res, 200, true, 'Password updated successfully', populated);
  } catch (error) {
    console.error('Error in updatePassword:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.deletePassword = async (req, res) => {
  try {
    const entry = await PasswordVault.findByIdAndDelete(req.params.id);
    if (!entry) {
      return sendResponse(res, 404, false, 'Password entry not found');
    }

    sendResponse(res, 200, true, 'Password deleted successfully');
  } catch (error) {
    console.error('Error in deletePassword:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.decryptPassword = async (req, res) => {
  try {
    const entry = await PasswordVault.findById(req.params.id);
    if (!entry) {
      return sendResponse(res, 404, false, 'Password entry not found');
    }

    const plaintext = decrypt(entry.encryptedPassword, entry.iv, entry.authTag);

    sendResponse(res, 200, true, 'Password decrypted successfully', { password: plaintext });
  } catch (error) {
    console.error('Error in decryptPassword:', error);
    sendResponse(res, 500, false, 'Failed to decrypt password');
  }
};
