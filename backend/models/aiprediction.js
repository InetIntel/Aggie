// Represents a prediction of the media 
// Reference https://detect.truemedia.org/api-docs

var database = require('../database');
var mongoose = database.mongoose;

var aiPredictionSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
  id: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['WAITING', 'ERROR', 'COMPLETE', 'PROCESSING'], required: true, default: 'WAITING' },
  analysisTime: { type: Number, default: 0.0 },
  // Not sure what the enum values are for verdict, its probably High and Low? Can add after testing api
  verdict: String,
  url: { type: String },
  fetchedAt: Date,
  prediction: { type: Object },
  verdict: { type: String },
  resolved: { type: String, enum: ['failure', 'resolved', 'unresolved'], required: true, default: 'unresolved' },
  results: [new mongoose.Schema({
    mediaId: { type: String },
    results: {
      type: Map,
      of: mongoose.SchemaTypes.Mixed,
      default: {},
    }
  })],
  media: [{
    type: Map,
    of: mongoose.SchemaTypes.Mixed,
    default: {},
  }]
  //   eg. "results": {
  //     "video1": {
  //         "rank": "high",
  //         "score": 0.7986209988594055
  //       },
  //       "audio1": {
  //         "rank": "high",
  //         "score": 0.7186686992645264
  //       },}
}, { timestamps: true });


aiPredictionSchema.methods.getUnresolved = async function () {
  const results = await aiprediction.find({ resolved: 'unresolved' }).exec()

  return results;
}

aiPredictionSchema.methods.setMedia = async function (id, data) {

  const predictionDoc = await aiprediction.findById(id).exec()
  predictionDoc.resolved = data.result;
  predictionDoc.media = data.media

  await predictionDoc.save();

  return;
}


aiPredictionSchema.methods.getUnprocessed = async function () {
  const results = await aiprediction.find({ resolved: 'resolved', status: 'WAITING' }).exec()

  return results;
}
aiPredictionSchema.methods.updateResults = async function (id, data) {
  const predictionDoc = await aiprediction.findById(id).exec()
  predictionDoc.status = data.status;
  predictionDoc.results = data.results
  if (data.status === 'COMPLETE') {
    predictionDoc.analysisTime = data.analysisTime
    predictionDoc.verdict = data.verdict
  }

  await predictionDoc.save();
  return;
}

var aiprediction = mongoose.model('aiprediction', aiPredictionSchema);

module.exports = aiprediction;
