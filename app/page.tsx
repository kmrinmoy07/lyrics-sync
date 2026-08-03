import songData from "@/data/songs.json";
import { SongExperience, type Song } from "@/components/song-experience";

export default function Home() {
  return <SongExperience songs={songData.songs as Song[]} />;
}
