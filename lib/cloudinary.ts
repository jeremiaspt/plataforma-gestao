import { v2 as cloudinary } from "cloudinary";

const maxPhotoBytes = 5 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("cloudinary_config");
  }

  cloudinary.config({
    api_key: apiKey,
    api_secret: apiSecret,
    cloud_name: cloudName,
    secure: true
  });
}

export async function uploadLostFoundPhoto(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  if (file.size > maxPhotoBytes || !allowedPhotoTypes.has(file.type)) {
    throw new Error("photo");
  }

  configureCloudinary();

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: "plataforma-gestao/perdidos-achados",
    resource_type: "image",
    transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }]
  });

  return {
    publicId: result.public_id,
    url: result.secure_url
  };
}

export async function deleteCloudinaryPhoto(publicId: string | null | undefined) {
  if (!publicId) {
    return;
  }

  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}
