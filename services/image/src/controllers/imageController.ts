import { Request, Response, NextFunction } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { AuthUser } from "../middleware/auth";
import { queryDatabase } from "../utils/db";

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
  console.log("ENTERED POST /v1/submit");

  try {
    const auth = (req as any).auth as AuthUser;
    const username = auth.sub;
    const { imageName } = req.body;

    if (!imageName || typeof imageName !== "string") {
      return res.status(400).json({ error: "Image name is required" });
    }
    if (imageName.length > 40) {
      return res
        .status(400)
        .json({ error: "Image name must be 40 characters or less" });
    }
    if (!S3_BUCKET_NAME) {
      return res
        .status(500)
        .json({ error: "Server configuration error (S3_BUCKET_NAME missing)" });
    }
    if (!CLOUDFRONT_DOMAIN) {
      return res
        .status(500)
        .json({
          error: "Server configuration error (CLOUDFRONT_DOMAIN missing)",
        });
    }

    const uuidFilename = uuidv4();

    const putObjectCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: uuidFilename,
      ContentType: "image/*",
    });

    const presignedUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: 900,
    });

    const result = await queryDatabase<{ id: number; created_at: string }>(
      "INSERT INTO images (username, uuid_filename, image_name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, created_at",
      [username, uuidFilename, imageName.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: "Failed to create image record" });
    }

    res.status(200).json({
      success: true,
      presignedUrl,
      imageId: result.rows[0].id,
      uuidFilename,
      cloudfrontUrl: generateCloudFrontUrl(uuidFilename),
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
  console.log("ENTERED GET /v1/gallery");

  try {
    const limit = parseInt(req.query.limit as string) || 100;
    if (limit < 1 || limit > 1000) {
      return res
        .status(400)
        .json({ error: "Limit must be between 1 and 1000" });
    }

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

    const images = result.rows.map((image) => ({
      id: image.id,
      username: image.username,
      nickname: image.nickname || null,
      image_name: image.image_name,
      created_at: image.created_at,
      cloudfront_url: generateCloudFrontUrl(image.uuid_filename),
    }));

    res.status(200).json({
      success: true,
      images,
      count: images.length,
    });
  } catch (err) {
    return next(err);
  }
}
