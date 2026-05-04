const { uploadToR2 } = require('../utils/r2Storage');
const sendResponse = require('../utils/response');

exports.uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendResponse(res, 400, false, 'No files uploaded');
    }

    const uploadPromises = req.files.map(file => uploadToR2(file));
    const urls = await Promise.all(uploadPromises);

    sendResponse(res, 200, true, 'Files uploaded successfully', { urls });
  } catch (error) {
    console.error('R2 Upload Error:', error);
    sendResponse(res, 500, false, 'Failed to upload files to R2');
  }
};
