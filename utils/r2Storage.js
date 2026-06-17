const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
require("dotenv").config();

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const uploadToR2 = async (file) => {
  const fileExtension = file.originalname.split(".").pop();
  const fileName = `${crypto.randomBytes(16).toString("hex")}.${fileExtension}`;

  const params = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3Client.send(new PutObjectCommand(params));
  
  // Return the public URL (assumes you have a custom domain or R2 public URL configured)
  return `${process.env.R2_PUBLIC_URL}/${fileName}`;
};

module.exports = { uploadToR2 };
