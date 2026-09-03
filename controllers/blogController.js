const Blog = require('../models/Blog');
const AuditLog = require('../models/AuditLog');
const { uploadToR2 } = require('../utils/r2Storage');
const sendResponse = require('../utils/response');

// Helper to generate a URL-friendly unique slug
const generateSlug = async (title, currentId = null) => {
  let baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!baseSlug) {
    baseSlug = `post-${Date.now()}`;
  }

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = { slug };
    if (currentId) {
      query._id = { $ne: currentId };
    }
    const existing = await Blog.findOne(query);
    if (!existing) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

// ==========================================
// AUTHENTICATED CRM CONTROLLERS
// ==========================================

// Upload blog cover/article image
exports.uploadBlogImage = async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, false, 'No image file uploaded');
    }

    let url = await uploadToR2(req.file);

    // If local relative url, format with host protocol
    if (url.startsWith('/uploads/')) {
      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost:5000';
      url = `${protocol}://${host}${url}`;
    }

    sendResponse(res, 200, true, 'Image uploaded successfully', { url });
  } catch (error) {
    console.error('Error uploading blog image:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Get all blogs (Admin / Staff dashboard with filters & pagination)
exports.getBlogs = async (req, res) => {
  try {
    const { search, category, status, tag, sort = 'newest', page = 1, limit = 10 } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (tag) {
      filter.tags = tag;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    if (sort === 'popular') sortOption = { views: -1 };
    if (sort === 'title') sortOption = { title: 1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .populate('author', 'username role')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Blog.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, 'Blogs fetched successfully', {
      blogs,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error in getBlogs:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Get single blog by ID for editing
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('author', 'username role');

    if (!blog) {
      return sendResponse(res, 404, false, 'Blog not found');
    }

    sendResponse(res, 200, true, 'Blog fetched successfully', blog);
  } catch (error) {
    console.error('Error in getBlogById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Create new blog post
exports.createBlog = async (req, res) => {
  try {
    const { title, content, excerpt, coverImage, coverImagePosition, category, tags, status, customSlug } = req.body;

    if (!title || !content) {
      return sendResponse(res, 400, false, 'Title and content are required');
    }

    const slug = customSlug
      ? await generateSlug(customSlug)
      : await generateSlug(title);

    const parsedTags = Array.isArray(tags)
      ? tags.map((t) => t.trim()).filter(Boolean)
      : typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const blog = await Blog.create({
      title,
      slug,
      content,
      excerpt: excerpt || title,
      coverImage: coverImage || '',
      coverImagePosition: coverImagePosition || '50% 50%',
      category: category || 'General',
      tags: parsedTags,
      status: status || 'Draft',
      author: req.user._id,
      authorName: req.user.username || 'Admin',
      publishedAt: status === 'Published' ? new Date() : null,
    });

    // Audit Log (safe)
    try {
      await AuditLog.create({
        action: 'CREATE',
        user: req.user.username || 'Admin',
        details: `Created blog post: "${blog.title}" (${blog.status})`,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation warning:', auditErr.message);
    }

    sendResponse(res, 201, true, 'Blog created successfully', blog);
  } catch (error) {
    console.error('Error in createBlog:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Update blog post
exports.updateBlog = async (req, res) => {
  try {
    const { title, content, excerpt, coverImage, coverImagePosition, category, tags, status, customSlug } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return sendResponse(res, 404, false, 'Blog not found');
    }

    if (title && title !== blog.title && !customSlug) {
      blog.slug = await generateSlug(title, blog._id);
      blog.title = title;
    } else if (title) {
      blog.title = title;
    }

    if (customSlug && customSlug !== blog.slug) {
      blog.slug = await generateSlug(customSlug, blog._id);
    }

    if (content !== undefined) blog.content = content;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (coverImage !== undefined) blog.coverImage = coverImage;
    if (coverImagePosition !== undefined) blog.coverImagePosition = coverImagePosition;
    if (category !== undefined) blog.category = category;

    if (tags !== undefined) {
      blog.tags = Array.isArray(tags)
        ? tags.map((t) => t.trim()).filter(Boolean)
        : typeof tags === 'string'
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
    }

    if (status !== undefined) {
      if (status === 'Published' && blog.status !== 'Published' && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
      blog.status = status;
    }

    await blog.save();

    // Audit Log (safe)
    try {
      await AuditLog.create({
        action: 'UPDATE',
        user: req.user.username || 'Admin',
        details: `Updated blog post: "${blog.title}" (${blog.status})`,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation warning:', auditErr.message);
    }

    sendResponse(res, 200, true, 'Blog updated successfully', blog);
  } catch (error) {
    console.error('Error in updateBlog:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Delete blog post
exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return sendResponse(res, 404, false, 'Blog not found');
    }

    await Blog.findByIdAndDelete(req.params.id);

    // Audit Log (safe)
    try {
      await AuditLog.create({
        action: 'STATUS_CHANGE',
        user: req.user.username || 'Admin',
        details: `Deleted blog post: "${blog.title}"`,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation warning:', auditErr.message);
    }

    sendResponse(res, 200, true, 'Blog deleted successfully');
  } catch (error) {
    console.error('Error in deleteBlog:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Get blog statistics summary
exports.getBlogStats = async (req, res) => {
  try {
    const [total, published, draft, archived, totalViewsResult] = await Promise.all([
      Blog.countDocuments(),
      Blog.countDocuments({ status: 'Published' }),
      Blog.countDocuments({ status: 'Draft' }),
      Blog.countDocuments({ status: 'Archived' }),
      Blog.aggregate([{ $group: { _id: null, totalViews: { $sum: '$views' } } }]),
    ]);

    const totalViews = totalViewsResult[0]?.totalViews || 0;

    sendResponse(res, 200, true, 'Blog statistics fetched successfully', {
      total,
      published,
      draft,
      archived,
      totalViews,
    });
  } catch (error) {
    console.error('Error in getBlogStats:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// ==========================================
// PUBLIC PORTFOLIO CONTROLLERS (NO AUTH)
// ==========================================

// Public: Get published blogs for portfolio
exports.getPublicBlogs = async (req, res) => {
  try {
    const { category, tag, search, sort = 'latest', page = 1, limit = 9 } = req.query;

    const filter = { status: 'Published' };

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (tag) {
      filter.tags = tag;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { publishedAt: -1, createdAt: -1 };
    if (sort === 'popular') sortOption = { views: -1 };
    if (sort === 'oldest') sortOption = { publishedAt: 1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 9);
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .select('title slug excerpt coverImage coverImagePosition category tags readTime views publishedAt authorName createdAt')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Blog.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, 'Public blogs fetched successfully', {
      blogs,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error in getPublicBlogs:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Public: Get single published blog by slug or ID & increment view count
exports.getPublicBlogBySlugOrId = async (req, res) => {
  try {
    const { slugOrId } = req.params;

    // Check if it matches an ObjectId or slug
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slugOrId);
    const query = isObjectId
      ? { _id: slugOrId, status: 'Published' }
      : { slug: slugOrId.toLowerCase(), status: 'Published' };

    // Atomically increment views count and return updated document
    const blog = await Blog.findOneAndUpdate(
      query,
      { $inc: { views: 1 } },
      { new: true }
    ).select('-__v');

    if (!blog) {
      return sendResponse(res, 404, false, 'Article not found or not published');
    }

    sendResponse(res, 200, true, 'Article fetched successfully', blog);
  } catch (error) {
    console.error('Error in getPublicBlogBySlugOrId:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// Public: Get list of published categories with counts
exports.getPublicCategories = async (req, res) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: 'Published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const formatted = categories.map((c) => ({
      name: c._id || 'General',
      count: c.count,
    }));

    sendResponse(res, 200, true, 'Categories fetched successfully', formatted);
  } catch (error) {
    console.error('Error in getPublicCategories:', error);
    sendResponse(res, 500, false, error.message);
  }
};
