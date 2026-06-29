const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.get('/users', protect, authController.getAllUsers);
router.put('/users/:id/departments', protect, authController.updateUserDepartments);
router.post('/set-vault-pin', protect, authController.setVaultPin);
router.post('/verify-vault-pin', protect, authController.verifyVaultPin);

module.exports = router;
