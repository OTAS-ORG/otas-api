const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', passwordController.getPasswords);
router.get('/:id', passwordController.getPasswordById);
router.post('/', passwordController.createPassword);
router.put('/:id', passwordController.updatePassword);
router.delete('/:id', passwordController.deletePassword);
router.post('/:id/decrypt', passwordController.decryptPassword);

module.exports = router;
