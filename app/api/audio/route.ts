import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultAudioHosts = new Set([
  "baahi-eefgd7dsdtcgg6gu.z02.azurefd.net",
]);

function allowedHosts() {
  const configured = (process.env.AUDIO_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((host) => host.trim().toLocaleLowerCase())
    .filter(Boolean);
  return new Set([...defaultAudioHosts, ...configured]);
}

function parseUpstreamUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedHosts().has(url.hostname.toLocaleLowerCase())) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function proxyUrl(url: URL) {
  return `/api/audio?url=${encodeURIComponent(url.href)}`;
}

function rewriteManifest(manifest: string, baseUrl: URL) {
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          return `URI="${proxyUrl(new URL(uri, baseUrl))}"`;
        });
      }

      return proxyUrl(new URL(trimmed, baseUrl));
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
  const upstreamUrl = parseUpstreamUrl(request.nextUrl.searchParams.get("url"));
  if (!upstreamUrl) {
    return Response.json({ error: "Invalid or disallowed audio URL." }, { status: 400 });
  }

  const requestHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) requestHeaders.set("range", range);
  requestHeaders.set("accept", request.headers.get("accept") ?? "*/*");

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: requestHeaders,
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The upstream audio server could not be reached." }, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return Response.json(
      { error: "The upstream audio server returned an error." },
      { status: upstream.status },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const isManifest =
    upstreamUrl.pathname.toLocaleLowerCase().endsWith(".m3u8") ||
    contentType.includes("mpegurl");

  if (isManifest) {
    const rewritten = rewriteManifest(await upstream.text(), upstreamUrl);
    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  }

  const responseHeaders = new Headers({
    "content-type": contentType,
    "cache-control": upstream.headers.get("cache-control") ?? "public, max-age=3600",
  });
  for (const header of ["accept-ranges", "content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
