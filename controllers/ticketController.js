const Ticket = require('../models/Ticket');
const TicketComment = require('../models/TicketComment');
const TicketHistory = require('../models/TicketHistory');
const Department = require('../models/Department');
const sendResponse = require('../utils/response');

const createHistory = async (ticket_id, user_id, action_performed) => {
  await TicketHistory.create({ ticket_id, user_id, action_performed });
};

exports.getTickets = async (req, res) => {
  try {
    if (req.user.role === 'Sales') {
      return sendResponse(res, 403, false, 'Access denied');
    }
    const { search, status } = req.query;
    const filter = {};

    if (req.user.role !== 'Admin') {
      if (!req.user.departments || req.user.departments.length === 0) {
        filter.created_by = req.user._id;
      } else {
        filter.department_id = { $in: req.user.departments };
      }
    }

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tickets = await Ticket.find(filter)
      .populate('department_id', 'name')
      .populate('assigned_to', 'username')
      .populate('created_by', 'username')
      .sort({ createdAt: -1 });

    sendResponse(res, 200, true, 'Tickets fetched successfully', tickets);
  } catch (error) {
    console.error('Error in getTickets:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('department_id', 'name')
      .populate('assigned_to', 'username')
      .populate('created_by', 'username');

    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    const [comments, history] = await Promise.all([
      TicketComment.find({ ticket_id: ticket._id })
        .populate('user_id', 'username')
        .sort({ createdAt: 1 }),
      TicketHistory.find({ ticket_id: ticket._id })
        .populate('user_id', 'username')
        .sort({ createdAt: -1 })
    ]);

    sendResponse(res, 200, true, 'Ticket fetched successfully', {
      ticket,
      comments,
      history
    });
  } catch (error) {
    console.error('Error in getTicketById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createTicket = async (req, res) => {
  try {
    if (req.user.role === 'Sales') {
      return sendResponse(res, 403, false, 'Access denied');
    }
    const { title, description, priority, department_id } = req.body;

    const ticket = await Ticket.create({
      title,
      description,
      priority: priority || 'Medium',
      department_id,
      created_by: req.user._id
    });

    await createHistory(ticket._id, req.user._id, 'Created ticket');

    const populated = await Ticket.findById(ticket._id)
      .populate('department_id', 'name')
      .populate('created_by', 'username');

    sendResponse(res, 201, true, 'Ticket created successfully', populated);
  } catch (error) {
    console.error('Error in createTicket:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.assignTicket = async (req, res) => {
  try {
    const { assigned_to, department_id } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    const changes = [];
    if (assigned_to !== undefined) {
      ticket.assigned_to = assigned_to;
      changes.push('assigned user');
    }
    if (department_id !== undefined) {
      ticket.department_id = department_id;
      changes.push('changed department');
    }

    await ticket.save();

    if (changes.length > 0) {
      await createHistory(ticket._id, req.user._id, changes.join(' and '));
    }

    const populated = await Ticket.findById(ticket._id)
      .populate('department_id', 'name')
      .populate('assigned_to', 'username')
      .populate('created_by', 'username');

    sendResponse(res, 200, true, 'Ticket updated successfully', populated);
  } catch (error) {
    console.error('Error in assignTicket:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    const oldStatus = ticket.status;
    ticket.status = status;
    await ticket.save();

    await createHistory(ticket._id, req.user._id, `Changed status from ${oldStatus} to ${status}`);

    sendResponse(res, 200, true, 'Ticket status updated successfully', ticket);
  } catch (error) {
    console.error('Error in updateStatus:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.addComment = async (req, res) => {
  try {
    const { message } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    const comment = await TicketComment.create({
      ticket_id: ticket._id,
      user_id: req.user._id,
      message
    });

    await createHistory(ticket._id, req.user._id, 'Added comment');

    const populated = await TicketComment.findById(comment._id)
      .populate('user_id', 'username');

    sendResponse(res, 201, true, 'Comment added successfully', populated);
  } catch (error) {
    console.error('Error in addComment:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    sendResponse(res, 200, true, 'Departments fetched successfully', departments);
  } catch (error) {
    console.error('Error in getDepartments:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getUsersByDepartment = async (req, res) => {
  try {
    const User = require('../models/User');
    const { department_id } = req.params;
    const filter = department_id ? { department_id } : {};
    const users = await User.find(filter).select('_id username role department_id');
    sendResponse(res, 200, true, 'Users fetched successfully', users);
  } catch (error) {
    console.error('Error in getUsersByDepartment:', error);
    sendResponse(res, 500, false, error.message);
  }
};
