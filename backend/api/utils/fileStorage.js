const path = require('path');
const fs = require('fs').promises;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname,'../../../public/uploads');

async function saveFile(fileBuffer, originalname) {
    try {
        const normalizedName = originalname.trim().replace(/\s+/g, '_'); // remove extra spaces
        const fileName = `${Date.now()}_${normalizedName}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        await fs.mkdir(UPLOAD_DIR, {recursive: true});
        await fs.writeFile(filePath, fileBuffer);
        return filePath;
    } catch (err) {
        console.error('debugging - Failed saving file: ', err);
        throw new Error(`Failed saving file: ${filePath}`, err);
    }

}


async function deleteFile(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (err) {
        // ignore if error is file path not exist
        if (err.code !== 'ENOENT') {
            console.error(`debugging - Failed deleting file: ${filePath}, `, err);
            throw new Error(`Failed deleting file: ${filePath}`, err);
        }
    }
}


module.exports = {
    saveFile,
    deleteFile,
}