const express = require('express');
const router = express.Router();
const publicFormController = require('../controllers/publicFormController');
const uploadController = require('../controllers/uploadController');
const blogController = require('../controllers/blogController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// NO AUTH REQUIRED FOR THESE ROUTES
router.get('/client-info/:id', publicFormController.getPublicClientInfo);
router.post('/submit', publicFormController.submitPublicForm);
router.post('/upload', upload.array('files'), uploadController.uploadFiles);

// Public Blog Endpoints for Portfolio Website (OTAS)
router.get('/blogs', blogController.getPublicBlogs);
router.get('/blogs/categories', blogController.getPublicCategories);
router.get('/blogs/:slugOrId', blogController.getPublicBlogBySlugOrId);

// Public Blog Endpoints for AutoShop Product Website
router.get('/autoshop/blogs', blogController.getPublicAutoShopBlogs);
router.get('/autoshop/blogs/categories', blogController.getPublicAutoShopCategories);
router.get('/autoshop/blogs/:slugOrId', blogController.getPublicAutoShopBlogBySlugOrId);

module.exports = router;
