const Event = require('../models/Event');
const sendResponse = require('../utils/response');

// GET /api/events
exports.getEvents = async (req, res) => {
  try {
    const { startDate, endDate, userId, clientId, type, status } = req.query;
    const filter = {};

    if (startDate && endDate) {
      filter.$or = [
        {
          startDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        },
        {
          endDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        },
        {
          startDate: { $lte: new Date(startDate) },
          endDate: { $gte: new Date(endDate) },
        },
      ];
    } else if (startDate) {
      filter.startDate = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.endDate = { $lte: new Date(endDate) };
    }

    if (userId) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ organizer: userId }, { attendees: userId }],
      });
    }

    if (clientId) {
      filter.clientId = clientId;
    }

    if (type) {
      filter.type = type;
    }

    if (status) {
      filter.status = status;
    }

    const events = await Event.find(filter)
      .populate('organizer', 'username email role')
      .populate('attendees', 'username email role')
      .populate('clientId', 'companyName contactPerson contactInfo status')
      .sort({ startDate: 1 });

    sendResponse(res, 200, true, 'Events retrieved successfully', events);
  } catch (error) {
    console.error('Error in getEvents:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// GET /api/events/:id
exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id)
      .populate('organizer', 'username email role')
      .populate('attendees', 'username email role')
      .populate('clientId', 'companyName contactPerson contactInfo status')
      .populate('createdBy', 'username');

    if (!event) {
      return sendResponse(res, 404, false, 'Event not found');
    }

    sendResponse(res, 200, true, 'Event retrieved successfully', event);
  } catch (error) {
    console.error('Error in getEventById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// POST /api/events
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      startDate,
      endDate,
      allDay,
      location,
      meetingUrl,
      color,
      clientId,
      organizer,
      attendees,
      status,
    } = req.body;

    if (!title || !startDate || !endDate) {
      return sendResponse(res, 400, false, 'Title, start date and end date are required');
    }

    const event = await Event.create({
      title,
      description: description || '',
      type: type || 'meeting',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      allDay: allDay || false,
      location: location || '',
      meetingUrl: meetingUrl || '',
      color: color || 'blue',
      clientId: clientId || null,
      organizer: organizer || req.user._id,
      attendees: attendees || [],
      status: status || 'scheduled',
      createdBy: req.user._id,
    });

    const populatedEvent = await Event.findById(event._id)
      .populate('organizer', 'username email role')
      .populate('attendees', 'username email role')
      .populate('clientId', 'companyName contactPerson contactInfo status');

    sendResponse(res, 201, true, 'Event created successfully', populatedEvent);
  } catch (error) {
    console.error('Error in createEvent:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// PUT /api/events/:id
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

    const event = await Event.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('organizer', 'username email role')
      .populate('attendees', 'username email role')
      .populate('clientId', 'companyName contactPerson contactInfo status');

    if (!event) {
      return sendResponse(res, 404, false, 'Event not found');
    }

    sendResponse(res, 200, true, 'Event updated successfully', event);
  } catch (error) {
    console.error('Error in updateEvent:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// DELETE /api/events/:id
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findByIdAndDelete(id);

    if (!event) {
      return sendResponse(res, 404, false, 'Event not found');
    }

    sendResponse(res, 200, true, 'Event deleted successfully');
  } catch (error) {
    console.error('Error in deleteEvent:', error);
    sendResponse(res, 500, false, error.message);
  }
};
