const Ticket = require('../models/Ticket');
const TicketComment = require('../models/TicketComment');
const TicketHistory = require('../models/TicketHistory');
const Department = require('../models/Department');
const sendResponse = require('../utils/response');
const { notifyTicketAssigned, notifyTicketComment, checkAndSendDueReminders } = require('../services/telegramService');

const createHistory = async (ticket_id, user_id, action_performed) => {
  await TicketHistory.create({ ticket_id, user_id, action_performed });
};

exports.getTickets = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    const totalDepts = await Department.countDocuments();
    const isAllDepts = req.user.departments && req.user.departments.length >= totalDepts;
    const isAdmin = req.user.role === 'Admin' || isAllDepts;

    if (!isAdmin) {
      const userDepts = req.user.departments || [];
      const accessConditions = [
        { created_by: req.user._id },
        { assigned_to: req.user._id }
      ];
      if (userDepts.length > 0) {
        accessConditions.push({ department_id: { $in: userDepts } });
      }
      filter.$or = accessConditions;
    }

    if (status) filter.status = status;
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
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

    // Access control check: Admin, creator, assignee, or user within the ticket's department
    const totalDepts = await Department.countDocuments();
    const isAllDepts = req.user.departments && req.user.departments.length >= totalDepts;
    const isAdmin = req.user.role === 'Admin' || isAllDepts;

    if (!isAdmin) {
      const ticketDeptId = (ticket.department_id?._id || ticket.department_id)?.toString();
      const userDepts = (req.user.departments || []).map(d => d.toString());
      const isCreator = (ticket.created_by?._id || ticket.created_by)?.toString() === req.user._id.toString();
      const isAssignee = (ticket.assigned_to?._id || ticket.assigned_to)?.toString() === req.user._id.toString();
      const isInDept = ticketDeptId && userDepts.includes(ticketDeptId);

      if (!isCreator && !isAssignee && !isInDept) {
        return sendResponse(res, 403, false, 'Not authorized to access this ticket');
      }
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
    const { title, description, priority, department_id, dueDate } = req.body;

    const ticket = await Ticket.create({
      title,
      description,
      priority: priority || 'Medium',
      department_id: department_id || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
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
    const { assigned_to, department_id, dueDate } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    const changes = [];
    if (assigned_to !== undefined) {
      ticket.assigned_to = assigned_to || null;
      changes.push('assigned user');
    }
    if (department_id !== undefined) {
      ticket.department_id = department_id || null;
      changes.push('changed department');
    }
    if (dueDate !== undefined) {
      const oldDue = ticket.dueDate ? new Date(ticket.dueDate).toISOString().split('T')[0] : 'None';
      const newDue = dueDate ? new Date(dueDate).toISOString().split('T')[0] : 'None';
      if (oldDue !== newDue) {
        ticket.dueDate = dueDate ? new Date(dueDate) : null;
        ticket.dueReminderSent = false;
        changes.push(`set due date to ${newDue}`);
      }
    }

    await ticket.save();

    if (changes.length > 0) {
      await createHistory(ticket._id, req.user._id, changes.join(' and '));
    }

    // Send Telegram notification when ticket is assigned
    if (assigned_to !== undefined && assigned_to) {
      await notifyTicketAssigned(ticket._id);
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
    const { message, is_internal } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    const comment = await TicketComment.create({
      ticket_id: ticket._id,
      user_id: req.user._id,
      message,
      is_internal: Boolean(is_internal)
    });

    await createHistory(
      ticket._id,
      req.user._id,
      is_internal ? 'Added internal note' : 'Added comment'
    );

    // Only trigger Telegram bot notification for public comments (NOT for internal notes)
    if (!is_internal) {
      notifyTicketComment(comment._id).catch(err => {
        console.error('Error sending Telegram notification for comment:', err);
      });
    }

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

exports.deleteTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return sendResponse(res, 404, false, 'Ticket not found');
    }

    // Authorization: Only Admin, the ticket creator, or a user with all departments can delete
    const totalDepts = await Department.countDocuments();
    const isAllDepts = req.user.departments && req.user.departments.length >= totalDepts;
    const isAdmin = req.user.role === 'Admin' || isAllDepts;
    const isCreator = ticket.created_by.toString() === req.user._id.toString();

    if (!isAdmin && !isCreator) {
      return sendResponse(res, 403, false, 'Not authorized to delete this ticket');
    }

    // Delete associated comments and history
    await Promise.all([
      TicketComment.deleteMany({ ticket_id: ticket._id }),
      TicketHistory.deleteMany({ ticket_id: ticket._id }),
      Ticket.findByIdAndDelete(ticket._id),
    ]);

    sendResponse(res, 200, true, 'Ticket deleted successfully');
  } catch (error) {
    console.error('Error in deleteTicket:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getUsersByDepartment = async (req, res) => {
  try {
    const User = require('../models/User');
    const { department_id } = req.params;
    const filter = department_id ? { departments: department_id } : {};
    const users = await User.find(filter).select('_id username role departments');
    sendResponse(res, 200, true, 'Users fetched successfully', users);
  } catch (error) {
    console.error('Error in getUsersByDepartment:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.triggerDueReminders = async (req, res) => {
  try {
    const count = await checkAndSendDueReminders();
    sendResponse(res, 200, true, `Processed due date reminders. Sent ${count} notification(s).`, { count });
  } catch (error) {
    console.error('Error in triggerDueReminders:', error);
    sendResponse(res, 500, false, error.message);
  }
};

