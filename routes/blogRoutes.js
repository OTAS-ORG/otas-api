const express = require('express');
const router = express.Router();
const multer = require('multer');
const blogController = require('../controllers/blogController');
const { protect } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

// All routes here require authentication
router.use(protect);

router.get('/stats', blogController.getBlogStats);
router.get('/', blogController.getBlogs);
router.get('/:id', blogController.getBlogById);
router.post('/upload', upload.single('image'), blogController.uploadBlogImage);
router.post('/', blogController.createBlog);
router.put('/:id', blogController.updateBlog);
router.delete('/:id', blogController.deleteBlog);

module.exports = router;
