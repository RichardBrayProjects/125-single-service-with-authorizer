import { authenticatedFetch } from "@/api";
import { toast } from "sonner";

export const MAX_IMAGES = 100;

const IMAGE_API_BASE_URL = import.meta.env.VITE_IMAGE_API_BASE_URL;

if (!IMAGE_API_BASE_URL) {
  throw new Error(
    "Missing VITE_IMAGE_API_BASE_URL (set it in a .env file)."
  );
}

interface PresignedUrlResponse {
  presignedUrl: string;
  success: boolean;
  message?: string;
  imageId?: number;
  uuidFilename?: string;
}

export interface ClientImageRecord {
  id: number;
  image_name: string;
  nickname?: string | null;
  uuid_filename?: string;
  created_at: string;
  cloudfront_url: string;
  username?: string;
}

interface GetImagesResponse {
  success: boolean;
  message?: string;
  images?: ClientImageRecord[];
  count?: number;
  filter?: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Request failed: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    toast.error("Error", {
      description: errorMessage,
    });
    throw new Error(errorMessage);
  }
  return response.json();
}

const api = {
  getPresignedUrl: async (imageName: string): Promise<PresignedUrlResponse> => {
    try {
      const response = await authenticatedFetch(
        `${IMAGE_API_BASE_URL}/v1/submit`,
        {
          method: "POST",
          body: JSON.stringify({ imageName }),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return handleResponse<PresignedUrlResponse>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get presigned URL";
      toast.error("Error", {
        description: message,
      });
      throw error;
    }
  },

  uploadToPresignedUrl: async (
    presignedUrl: string,
    file: File
  ): Promise<void> => {
    try {
      const response = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload image";
      toast.error("Error", {
        description: message,
      });
      throw error;
    }
  },

  getAllImages: async (limit: number = MAX_IMAGES): Promise<GetImagesResponse> => {
    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
      }).toString();

      const response = await authenticatedFetch(
        `${IMAGE_API_BASE_URL}/v1/gallery?${queryParams}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return handleResponse<GetImagesResponse>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get images";
      toast.error("Error", {
        description: message,
      });
      throw error;
    }
  },
};

export default { api };
