const database = require('../database');
const mongoose = database.mongoose;

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
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
