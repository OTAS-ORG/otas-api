const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');
const { protect } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.use(protect);
// Fail closed until the outstanding vault role/access policy is approved.
router.use(authorize('access', 'PasswordVault'));

router.get('/', passwordController.getPasswords);
router.get('/:id', passwordController.getPasswordById);
router.post('/', passwordController.createPassword);
router.put('/:id', passwordController.updatePassword);
router.delete('/:id', passwordController.deletePassword);
router.post('/:id/decrypt', passwordController.decryptPassword);

module.exports = router;
