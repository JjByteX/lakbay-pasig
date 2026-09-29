import { useEffect, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";

/**
 * usePlacePhotos -- the historical/current photo lists, the upload state,
 * and the upload/remove handlers, pulled out of admin-place-detail.tsx per
 * a SonarCloud cognitive-complexity finding on that page's top-level
 * component (22 against a 15 limit). Same move usePlaceReview already made
 * for the Verify/Reject dialog: this cluster had no reads or writes outside
 * itself and the two PhotoUploadArea props, so it moves as a unit with no
 * behavior change.
 *
 * id and isNew come from the caller (AdminPlaceDetailPage already reads
 * them via useParams). onError takes the page's own error setter: a string
 * to show a message, null to clear it, exactly as the inline handlers did.
 */

// Storage bucket for place photos. Not yet created by any migration in this
// repo, per architecture-notes.md's "what must never be touched without
// approval" (schema changes) — bucket creation is a Supabase dashboard/
// migration step outside this phase's file scope. Flagging here rather than
// silently inventing infra: create a public bucket named "place-photos"
// before this upload flow can succeed end to end.
const PHOTO_BUCKET = "content-photos";

export type PlacePhotoType = "historical" | "current";

export interface PlacePhoto {
  id: string;
  photo_url: string;
  photo_type: PlacePhotoType;
  sort_order: number;
}

// Supabase public URLs look like
// ".../storage/v1/object/public/<bucket>/<path>". place_photos only stores
// the public URL (see handlePhotoSelected), not the raw path, so deleting
// the file requires recovering <path> from it.
function getStoragePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

interface UsePlacePhotosOptions {
  id: string | undefined;
  isNew: boolean;
  onError: (message: string | null) => void;
}

export function usePlacePhotos({ id, isNew, onError }: Readonly<UsePlacePhotosOptions>) {
  const [historicalPhotos, setHistoricalPhotos] = useState<PlacePhoto[]>([]);
  const [currentPhotos, setCurrentPhotos] = useState<PlacePhoto[]>([]);
  const [uploading, setUploading] = useState<PlacePhotoType | null>(null);

  useEffect(() => {
    if (isNew) return;

    supabase
      .from("place_photos")
      .select("id, photo_url, photo_type, sort_order")
      .eq("place_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setHistoricalPhotos((data ?? []).filter((p) => p.photo_type === "historical"));
        setCurrentPhotos((data ?? []).filter((p) => p.photo_type === "current"));
      });
  }, [id, isNew]);

  function addPhoto(photoType: PlacePhotoType, photo: PlacePhoto) {
    const setList = photoType === "historical" ? setHistoricalPhotos : setCurrentPhotos;
    setList((prev) => [...prev, photo]);
  }

  function dropPhoto(photoType: PlacePhotoType, photoId: string) {
    const setList = photoType === "historical" ? setHistoricalPhotos : setCurrentPhotos;
    setList((prev) => prev.filter((p) => p.id !== photoId));
  }

  async function handlePhotoSelected(e: ChangeEvent<HTMLInputElement>, photoType: PlacePhotoType) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;

    setUploading(photoType);
    onError(null);

    const path = `${id}/${photoType}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file);

    if (uploadError) {
      setUploading(null);
      onError(`Photo upload failed: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    const list = photoType === "historical" ? historicalPhotos : currentPhotos;

    const { data: inserted, error: insertError } = await supabase
      .from("place_photos")
      .insert({
        place_id: id,
        photo_url: publicUrlData.publicUrl,
        photo_type: photoType,
        sort_order: list.length,
      })
      .select("id, photo_url, photo_type, sort_order")
      .single();

    setUploading(null);

    if (insertError || !inserted) {
      onError(insertError?.message ?? "Could not save the uploaded photo.");
      return;
    }

    addPhoto(photoType, inserted);
  }

  async function handleRemovePhoto(photo: PlacePhoto, photoType: PlacePhotoType) {
    const { error: deleteError } = await supabase.from("place_photos").delete().eq("id", photo.id);
    if (deleteError) {
      onError(deleteError.message);
      return;
    }

    // Remove the underlying file too, not just the place_photos row, or the
    // object is orphaned in the bucket. photo_url is the public URL from
    // handlePhotoSelected's getPublicUrl call above; the storage-relative
    // path is everything after the bucket name segment in that URL. A
    // failure here is logged, not surfaced, since the DB row (the part the
    // rest of the app reads) is already gone and correct either way.
    const storagePath = getStoragePathFromPublicUrl(photo.photo_url);
    if (storagePath) {
      const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
      if (storageError) {
        console.error("Failed to remove photo from storage:", storageError.message);
      }
    }

    dropPhoto(photoType, photo.id);
  }

  return {
    historicalPhotos,
    currentPhotos,
    uploading,
    handlePhotoSelected,
    handleRemovePhoto,
  };
}
