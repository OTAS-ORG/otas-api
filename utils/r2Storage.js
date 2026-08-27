const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

let s3Client = null;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

const uploadToR2 = async (file) => {
  const fileExtension = (file.originalname || "image.png").split(".").pop();
  const fileName = `${crypto.randomBytes(16).toString("hex")}.${fileExtension}`;

  // Try R2 if credentials exist
  if (s3Client && process.env.R2_BUCKET_NAME) {
    try {
      const params = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      await s3Client.send(new PutObjectCommand(params));
      const publicBase = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.dev`;
      return `${publicBase.replace(/\/$/, '')}/${fileName}`;
    } catch (r2Error) {
      console.warn("R2 upload failed, falling back to local file storage:", r2Error.message);
    }
  }

  // Local filesystem fallback
  const uploadsDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const localFilePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(localFilePath, file.buffer);

  return `/uploads/${fileName}`;
};

module.exports = { uploadToR2 };
