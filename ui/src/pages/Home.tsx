import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import imageService, {
  type ClientImageRecord,
  MAX_IMAGES,
} from "@/services/imageService";

export default () => {
  const { loading: authLoading, user } = useAuth();
  const [images, setImages] = useState<ClientImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log("--- Home() ---");

  useEffect(() => {
    if (authLoading) return;

    // Only fetch images if user is authenticated (gallery endpoint requires auth)
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchImages = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await imageService.api.getAllImages(MAX_IMAGES);
        if (response.success && response.images) {
          setImages(response.images);
        } else {
          setError(response.message || "Failed to load images");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load images";
        setError(message);
        console.error("Error fetching images:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [authLoading, user]);

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <p className="p-4 text-muted-foreground">Loading gallery...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-4xl font-bold mb-4">🎨 Uptick Art Gallery</h1>
        <p className="text-muted-foreground text-lg">
          Please log in to view the gallery.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-4xl font-bold mb-4">🎨 Uptick Art Gallery</h1>
      <p className="text-muted-foreground text-lg mb-8">
        {images.length > 0
          ? `Showing ${images.length} ${
              images.length === 1 ? "image" : "images"
            }`
          : "Welcome to our digital art collection"}
      </p>

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md">
          <p>Error loading images: {error}</p>
        </div>
      )}

      {images.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg">
            No images in the gallery yet. Be the first to upload!
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {images.map((image) => (
          <Card
            key={image.id}
            className="hover:shadow-lg transition-shadow overflow-hidden"
          >
            <div className="aspect-square relative bg-muted">
              <img
                src={image.cloudfront_url}
                alt={image.image_name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  // Fallback if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-muted-foreground">Image not available</div>`;
                  }
                }}
              />
            </div>
            <CardHeader>
              <CardTitle className="text-lg line-clamp-2">
                {image.image_name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {image.nickname || image.username || "Unknown artist"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(image.created_at).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
