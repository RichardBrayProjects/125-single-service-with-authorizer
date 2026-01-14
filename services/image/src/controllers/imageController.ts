import { Request, Response, NextFunction } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { AuthUser } from "../middleware/auth";
import { queryDatabase } from "../utils/db";

// S3Client must use us-east-1 region where the bucket is located
// (bucket is created by CloudFront stack in us-east-1, but Lambda runs in eu-west-2)
const S3_BUCKET_REGION = process.env.S3_BUCKET_REGION || "us-east-1";
const s3Client = new S3Client({ region: S3_BUCKET_REGION });

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

function generateCloudFrontUrl(uuidFilename: string): string {
  return `https://${CLOUDFRONT_DOMAIN}/${uuidFilename}`;
}

export async function submitHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.log("====================================");
  console.log("ENTERED router.post(/submit)");
  console.log("====================================");

  try {
    // Auth is guaranteed by requireAuth middleware, so we can safely access it
    const auth = (req as any).auth as AuthUser;
    // Use sub as username (Cognito user identifier)
    const username = auth.sub;
    const { imageName } = req.body;

    console.log(`Authenticated user - username: ${username}`);

    if (!imageName || typeof imageName !== "string") {
      return res.status(400).json({ error: "Image name is required" });
    }

    if (imageName.length > 40) {
      return res
        .status(400)
        .json({ error: "Image name must be 40 characters or less" });
    }

    if (!S3_BUCKET_NAME) {
      console.error("S3_BUCKET_NAME environment variable not set");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const uuidFilename = uuidv4();
    console.log(`Generated UUID filename: ${uuidFilename}`);

    const putObjectCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: uuidFilename,
      ContentType: "image/*",
    });

    const presignedUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: 900,
    });

    console.log(`Generated presigned URL for key: ${uuidFilename}`);

    // Insert image record into database
    const result = await queryDatabase<{
      id: number;
      created_at: string;
    }>(
      "INSERT INTO images (username, uuid_filename, image_name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, created_at",
      [username, uuidFilename, imageName.trim()]
    );

    if (result.rows.length === 0) {
      console.error("Failed to insert image record into database");
      return res.status(500).json({ error: "Failed to create image record" });
    }

    const imageRecord = result.rows[0];

    console.log(
      `Successfully created presigned URL for user: ${username}, image: ${imageName}`
    );

    res.status(200).json({
      success: true,
      presignedUrl,
      imageId: imageRecord.id,
      uuidFilename,
      message: "Presigned URL generated successfully",
    });
  } catch (err) {
    return next(err);
  }
}

export async function galleryHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.log("====================================");
  console.log("ENTERED router.get(/gallery)");
  console.log("====================================");

  try {
    // Auth is guaranteed by requireAuth middleware, so we can safely access it
    const auth = (req as any).auth as AuthUser;
    const username = auth.sub;
    console.log(`Authenticated user - username: ${username}`);

    // Get limit from query params, default to 100
    const limit = parseInt(req.query.limit as string) || 100;
    if (limit < 1 || limit > 1000) {
      return res
        .status(400)
        .json({ error: "Limit must be between 1 and 1000" });
    }

    console.log(`Fetching all images with limit: ${limit}`);

    // Get all images with user nicknames
    const result = await queryDatabase<{
      id: number;
      username: string;
      nickname: string | null;
      uuid_filename: string;
      image_name: string;
      created_at: string;
    }>(
      `SELECT 
        images.id, 
        images.username,
        users.nickname, 
        images.uuid_filename, 
        images.image_name, 
        images.created_at 
      FROM images
      INNER JOIN users ON images.username = users.username
      ORDER BY images.created_at DESC
      LIMIT $1`,
      [limit]
    );

    const images = result.rows;
    console.log(`Found ${images.length} total images in system`);

    const imagesWithCloudFrontUrls = images.map((image) => ({
      id: image.id,
      username: image.username,
      nickname: image.nickname || null,
      image_name: image.image_name,
      created_at: image.created_at,
      cloudfront_url: generateCloudFrontUrl(image.uuid_filename),
    }));

    console.log(
      `Loaded All Image Data from Database: ${JSON.stringify(
        imagesWithCloudFrontUrls
      )}`
    );

    res.status(200).json({
      success: true,
      images: imagesWithCloudFrontUrls,
      count: imagesWithCloudFrontUrls.length,
    });
  } catch (err) {
    return next(err);
  }
}
