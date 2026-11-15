const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/userManagementController');
const { protect, protectPasswordChange } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.post('/login', authController.login);
router.get('/me', protect, authController.me);
router.post('/change-password', protectPasswordChange, authController.changePassword);
router.get('/users', protect, authorize('read', 'StaffDirectory'), userController.getDirectory);
router.post('/users', protect, authorize('create', 'UserAccount'), userController.createUser);
router.put('/users/:id/roles', protect, authorize('update', 'UserAccount'), userController.setRoles);
router.post('/users/:id/disable', protect, authorize('update', 'UserAccount'), userController.disableUser);
router.post('/users/:id/enable', protect, authorize('update', 'UserAccount'), userController.enableUser);
router.post('/users/:id/reset-password', protect, authorize('update', 'UserAccount'), userController.resetPassword);
// Legacy role/department/employee writes are unavailable until migrated to the command layer.
router.post('/set-vault-pin', protect, authController.setVaultPin);
router.post('/verify-vault-pin', protect, authController.verifyVaultPin);

module.exports = router;
