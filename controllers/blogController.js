const Blog = require('../models/Blog');
const AuditLog = require('../models/AuditLog');
const { uploadToR2 } = require('../utils/r2Storage');
const sendResponse = require('../utils/response');

// Helper to build project filter (backward compatible with existing documents where project is not set)
const getProjectQuery = (project) => {
  const p = (project || 'otas').toLowerCase();
  if (p === 'all') return null;
  if (p === 'autoshop') return { project: 'autoshop' };
  // For 'otas', match documents with project: 'otas' OR legacy documents where project is null / missing
  return {
    $or: [
      { project: 'otas' },
      { project: { $exists: false } },
      { project: null },
    ],
  };
};

// Helper to generate a URL-friendly unique slug (scoped per project)
const generateSlug = async (title, currentId = null, project = 'otas') => {
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
  const projectScope = (project && project.toLowerCase() === 'autoshop') ? 'autoshop' : 'otas';

  while (true) {
    const query = { slug, project: projectScope };
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
    // Background migration: backfill legacy blogs without project to 'otas'
    Blog.updateMany(
      { $or: [{ project: { $exists: false } }, { project: null }] },
      { $set: { project: 'otas' } }
    ).catch(() => {});

    const { search, category, status, tag, sort = 'newest', page = 1, limit = 10, project = 'otas' } = req.query;
    const andConditions = [];

    const projectCondition = getProjectQuery(project);
    if (projectCondition) {
      andConditions.push(projectCondition);
    }

    if (status && status !== 'All') {
      andConditions.push({ status });
    }

    if (category && category !== 'All') {
      andConditions.push({ category });
    }

    if (tag) {
      andConditions.push({ tags: tag });
    }

    if (search) {
      andConditions.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

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
    const { title, content, excerpt, coverImage, coverImagePosition, category, tags, status, customSlug, project = 'otas' } = req.body;

    if (!title || !content) {
      return sendResponse(res, 400, false, 'Title and content are required');
    }

    const projectScope = (project && project.toLowerCase() === 'autoshop') ? 'autoshop' : 'otas';

    const slug = customSlug
      ? await generateSlug(customSlug, null, projectScope)
      : await generateSlug(title, null, projectScope);

    const parsedTags = Array.isArray(tags)
      ? tags.map((t) => t.trim()).filter(Boolean)
      : typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const blog = await Blog.create({
      title,
      slug,
      project: projectScope,
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
        details: `Created blog post: "${blog.title}" (${blog.project}) (${blog.status})`,
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
    const { title, content, excerpt, coverImage, coverImagePosition, category, tags, status, customSlug, project } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return sendResponse(res, 404, false, 'Blog not found');
    }

    const projectScope = project !== undefined
      ? ((project && project.toLowerCase() === 'autoshop') ? 'autoshop' : 'otas')
      : (blog.project || 'otas');

    blog.project = projectScope;

    if (title && title !== blog.title && !customSlug) {
      blog.slug = await generateSlug(title, blog._id, projectScope);
      blog.title = title;
    } else if (title) {
      blog.title = title;
    }

    if (customSlug && customSlug !== blog.slug) {
      blog.slug = await generateSlug(customSlug, blog._id, projectScope);
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
    const { project = 'otas' } = req.query;
    const projectCondition = getProjectQuery(project);

    const baseFilter = projectCondition ? projectCondition : {};
    const buildFilter = (extra = {}) => {
      if (!projectCondition) return extra;
      return { $and: [projectCondition, extra] };
    };

    const [total, published, draft, archived, totalViewsResult] = await Promise.all([
      Blog.countDocuments(baseFilter),
      Blog.countDocuments(buildFilter({ status: 'Published' })),
      Blog.countDocuments(buildFilter({ status: 'Draft' })),
      Blog.countDocuments(buildFilter({ status: 'Archived' })),
      Blog.aggregate([
        ...(projectCondition ? [{ $match: projectCondition }] : []),
        { $group: { _id: null, totalViews: { $sum: '$views' } } },
      ]),
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

// Public: Get published blogs for portfolio (OTAS / AutoShop)
exports.getPublicBlogs = async (req, res) => {
  try {
    const { category, tag, search, sort = 'latest', page = 1, limit = 9 } = req.query;
    const project = (req.query.project || req.params.project || req.projectScope || 'otas').toLowerCase();

    const andConditions = [
      { status: 'Published' },
    ];

    const projectCondition = getProjectQuery(project);
    if (projectCondition) {
      andConditions.push(projectCondition);
    }

    if (category && category !== 'All') {
      andConditions.push({ category });
    }

    if (tag) {
      andConditions.push({ tags: tag });
    }

    if (search) {
      andConditions.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = { $and: andConditions };

    let sortOption = { publishedAt: -1, createdAt: -1 };
    if (sort === 'popular') sortOption = { views: -1 };
    if (sort === 'oldest') sortOption = { publishedAt: 1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 9);
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .select('title slug excerpt coverImage coverImagePosition category tags readTime views publishedAt authorName project createdAt')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Blog.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, 'Public blogs fetched successfully', {
      blogs,
      project,
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
    const project = (req.query.project || req.params.project || req.projectScope || 'otas').toLowerCase();

    // Check if it matches an ObjectId or slug
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slugOrId);
    const idOrSlugCondition = isObjectId
      ? { _id: slugOrId }
      : { slug: slugOrId.toLowerCase() };

    const projectCondition = getProjectQuery(project);

    const query = {
      $and: [
        { status: 'Published' },
        idOrSlugCondition,
        ...(projectCondition ? [projectCondition] : []),
      ],
    };

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
    const project = (req.query.project || req.params.project || req.projectScope || 'otas').toLowerCase();
    const projectCondition = getProjectQuery(project);

    const matchConditions = [
      { status: 'Published' },
      ...(projectCondition ? [projectCondition] : []),
    ];

    const categories = await Blog.aggregate([
      { $match: { $and: matchConditions } },
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

// AutoShop dedicated public endpoints
exports.getPublicAutoShopBlogs = async (req, res) => {
  req.projectScope = 'autoshop';
  return exports.getPublicBlogs(req, res);
};

exports.getPublicAutoShopBlogBySlugOrId = async (req, res) => {
  req.projectScope = 'autoshop';
  return exports.getPublicBlogBySlugOrId(req, res);
};

exports.getPublicAutoShopCategories = async (req, res) => {
  req.projectScope = 'autoshop';
  return exports.getPublicCategories(req, res);
};
