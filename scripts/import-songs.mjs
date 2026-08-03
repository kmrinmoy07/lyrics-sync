import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourcePath = path.join(projectRoot, "data", "songs.xlsx");
const outputPath = path.join(projectRoot, "data", "songs.json");

function text(value) {
  return String(value ?? "").trim();
}

function cleanLyric(value) {
  return text(value)
    .replace(/\s*\(\s*Corrected\s*\)\s*/gi, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseTimedLyrics(rawValue) {
  const lines = String(rawValue ?? "").split(/\r?\n/);
  const parsed = [];

  for (const rawLine of lines) {
    const timestampPattern = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g;
    const timestamps = [...rawLine.matchAll(timestampPattern)];
    const lyric = cleanLyric(rawLine.replace(timestampPattern, ""));

    if (!lyric) continue;

    for (const timestamp of timestamps) {
      const time = Number(timestamp[1]) * 60 + Number(timestamp[2]);
      if (Number.isFinite(time)) {
        parsed.push({ time: Math.round(time * 1000) / 1000, text: lyric });
      }
    }
  }

  return parsed
    .sort((a, b) => a.time - b.time)
    .filter(
      (line, index, all) =>
        index === 0 ||
        line.time !== all[index - 1].time ||
        line.text !== all[index - 1].text,
    );
}

function findValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (text(value)) return text(value);
  }
  return "";
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Excel source not found: ${sourcePath}`);
}

const workbook = XLSX.readFile(sourcePath, { cellDates: false });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

const songs = rows.map((row, index) => {
  const id = findValue(row, ["id", "ID"]) || String(index + 1);
  const title = findValue(row, ["mp3_title", "title", "Song Release"]);
  const artist = findValue(row, ["mp3_artist", "artist"]) || "Unknown artist";
  const release = findValue(row, ["Song Release", "release", "album"]) || title;
  const audioUrl = findValue(row, ["audio_url", "audioUrl", "audio"]);
  const imageUrl = findValue(row, [
    "image_url",
    "imageUrl",
    "song_image",
    "cover_url",
    "image",
  ]);
  const plainLyrics = text(row.lyrics);
  const timedLyrics = parseTimedLyrics(row.synced_timed_lyrics);

  if (!title || !audioUrl) {
    throw new Error(`Row ${index + 2} is missing a song title or audio URL.`);
  }

  return {
    id,
    title,
    artist,
    release,
    audioUrl,
    imageUrl: imageUrl || null,
    timedLyrics,
    plainLyrics: timedLyrics.length ? "" : plainLyrics,
  };
});

const uniqueIds = new Set(songs.map((song) => song.id));
if (uniqueIds.size !== songs.length) {
  throw new Error("The Excel source contains duplicate song IDs.");
}

const payload = {
  source: path.basename(sourcePath),
  sheet: sheetName,
  songCount: songs.length,
  songs,
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, "utf8");

const syncedCount = songs.filter((song) => song.timedLyrics.length > 0).length;
console.log(
  `Imported ${songs.length} songs from ${sheetName} (${syncedCount} with timed lyrics).`,
);
