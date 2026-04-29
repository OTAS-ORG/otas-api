const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true 
  },
  user: { 
    type: String, 
    default: 'Core Team' // v1.0 open to core team
  },
  action: { 
    type: String, 
    required: true // 'CREATE', 'UPDATE', 'STATUS_CHANGE', etc.
  },
  details: { 
    type: mongoose.Schema.Types.Mixed // Stores old/new values or descriptive text
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
