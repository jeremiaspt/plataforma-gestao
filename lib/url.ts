export function appRedirectUrl(path: string, request: Request) {
  const publicUrl = process.env.APP_URL;

  if (publicUrl) {
    return new URL(path, publicUrl);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost) {
    return new URL(path, `${forwardedProto}://${forwardedHost}`);
  }

  return new URL(path, request.url);
}
