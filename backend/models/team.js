const database = require('../database');
const mongoose = database.mongoose;
const { TEAM_PERMISSION_KEYS } = require('../access/teamMemberships');

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  leads: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,
  },
  permissionLimits: {
    deny: {
      type: [String],
      enum: TEAM_PERMISSION_KEYS,
      default: [],
    },
  },
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
