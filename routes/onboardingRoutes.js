const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/form/:token', onboardingController.getFormData);
router.post('/save/:token', onboardingController.saveFormData);
router.post('/submit/:token', onboardingController.submitForm);

router.use(protect);

router.post('/generate-link', onboardingController.generateLink);
router.get('/status/:clientId', onboardingController.getStatus);
router.delete('/tokens/:id', onboardingController.deleteToken);
router.get('/configs', onboardingController.getConfigs);
router.put('/config/:serviceType', onboardingController.updateConfig);
router.delete('/config/:serviceType', onboardingController.deleteConfig);
router.post('/config/:serviceType/clone', onboardingController.cloneConfig);
router.get('/config/:serviceType/export', onboardingController.exportConfig);
router.post('/config/import', onboardingController.importConfig);
router.put('/config/:serviceType/reorder-sections', onboardingController.reorderSections);
router.put('/config/:serviceType/sections/:sectionIndex/reorder-fields', onboardingController.reorderFields);
router.get('/submissions', onboardingController.getSubmissions);
router.get('/submissions/:id', onboardingController.getSubmission);
router.put('/submissions/:id/status', onboardingController.updateSubmissionStatus);

module.exports = router;
