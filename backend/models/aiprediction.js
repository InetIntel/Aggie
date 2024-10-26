// Represents a prediction of the media 
// Reference https://detect.truemedia.org/api-docs

var database = require('../database');
var mongoose = database.mongoose;

var aiPredictionSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: true, unique: true },
  trueMediaId: String,
  status: { type: String, enum: ['notstarted', 'pending', 'complete', 'error'], default: 'notstarted' },
  analysisTime: { type: Number, default: 0.0 },
  // Not sure what the enum values are for verdict, its probably High and Low? Can add after testing api
  verdict: String,
  results: {
    type: Map,
    of: SchemaTypes.Mixed,
    default: {},
  }
//   eg. "results": {
//     "video1": {
//         "rank": "high",
//         "score": 0.7986209988594055
//       },
//       "audio1": {
//         "rank": "high",
//         "score": 0.7186686992645264
//       },}
});
var aiprediction = mongoose.model('aiprediction', aiPredictionSchema);


module.exports = aiprediction;
