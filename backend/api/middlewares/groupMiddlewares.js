const multer = require('multer');
const { MAX_ATTACHMENT_SIZE, MAX_ATTACHMENT_COUNT } = require('../../models/group');

const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_ATTACHMENT_SIZE,
        files: MAX_ATTACHMENT_COUNT,
    },
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb (new Error(`Unsupported file type: ${file.originalname}`), false);
        }
    }
});


module.exports = upload;
