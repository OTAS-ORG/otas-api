const Document = require('../models/Document');
const { uploadToR2 } = require('../utils/r2Storage');
const sendResponse = require('../utils/response');

const uploadDocument = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendResponse(res, 400, false, 'No files uploaded');
    }

    const { clientId, projectId } = req.body;
    const userId = req.user._id;

    const uploadPromises = req.files.map(async (file) => {
      const url = await uploadToR2(file);
      return Document.create({
        name: file.originalname,
        url,
        type: file.mimetype,
        size: file.size,
        uploadedBy: userId,
        client: clientId || undefined,
        project: projectId || undefined,
      });
    });

    const docs = await Promise.all(uploadPromises);
    
    // Populate before sending back
    const populatedDocs = await Document.populate(docs, [
      { path: 'uploadedBy', select: 'username' },
      { path: 'client', select: 'companyName' },
      { path: 'project', select: 'name' }
    ]);

    return sendResponse(res, 201, true, 'Files uploaded successfully', populatedDocs);
  } catch (error) {
    console.error('Document Upload Error:', error);
    return sendResponse(res, 500, false, error.message);
  }
};

const getDocuments = async (req, res) => {
  try {
    const { search, clientId, projectId, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (clientId) filter.client = clientId;
    if (projectId) filter.project = projectId;
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const total = await Document.countDocuments(filter);
    const documents = await Document.find(filter)
      .populate('uploadedBy', 'username')
      .populate('client', 'companyName')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return sendResponse(res, 200, true, 'Documents fetched successfully', {
      documents,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findByIdAndDelete(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    return sendResponse(res, 200, true, 'Document deleted successfully');
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  deleteDocument,
};
