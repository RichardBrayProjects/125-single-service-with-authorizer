import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import imageService from "@/services/imageService";

const Submit: React.FC = () => {
  const { user } = useAuth();

  const [imageName, setImageName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
    setUploadMessage("");
  };

  const handleUpload = async () => {
    if (!imageName.trim()) {
      setUploadMessage("Please enter an image name");
      return;
    }
    if (!selectedFile) {
      setUploadMessage("Please select a file");
      return;
    }
    if (imageName.length > 40) {
      setUploadMessage("Image name must be 40 characters or less");
      return;
    }

    setIsUploading(true);
    setUploadMessage("");

    try {
      const presignedResponse = await imageService.api.getPresignedUrl(
        imageName.trim()
      );
      if (!presignedResponse.success || !presignedResponse.presignedUrl) {
        throw new Error(
          presignedResponse.message || "Failed to get upload URL"
        );
      }

      await imageService.api.uploadToPresignedUrl(
        presignedResponse.presignedUrl,
        selectedFile
      );

      toast.success("Upload successful", {
        description: `Image "${imageName.trim()}" has been uploaded successfully`,
      });

      setImageName("");
      setSelectedFile(null);
      const fileInput = document.getElementById(
        "file-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      // Error handling is done in imageService, but we can add additional handling here if needed
      // The toast.error is already shown by imageService
    } finally {
      setIsUploading(false);
    }
  };

  if (isUploading) {
    return (
      <div>
        <h1>File Upload</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Upload Image</CardTitle>
        </CardHeader>
        <CardContent>
          {!user && (
            <Alert className="mb-6 border-yellow-300 bg-yellow-100 dark:border-yellow-700 dark:bg-yellow-900/20">
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                Please sign in to upload files
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            <div>
              <Label htmlFor="image-name">Image Name</Label>
              <Input
                id="image-name"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                placeholder="Enter image name (max 40 characters)"
                maxLength={40}
                disabled={!user}
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {imageName.length}/40
              </div>
            </div>

            <div>
              <Label htmlFor="file-input">Select File</Label>
              <Input
                id="file-input"
                type="file"
                onChange={handleFileSelect}
                disabled={!user}
                accept="image/*"
              />
              {selectedFile && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Selected: {selectedFile.name} (
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>

            <Button
              onClick={handleUpload}
              disabled={
                !user || isUploading || !imageName.trim() || !selectedFile
              }
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>

            {uploadMessage && (
              <Alert
                variant={
                  uploadMessage.includes("successful")
                    ? "default"
                    : "destructive"
                }
              >
                <AlertDescription>{uploadMessage}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Submit;
