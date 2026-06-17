import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface SceneAsset {
  start: number;
  end: number;
  narration: string;
  imagePath: string;
  audioPath: string; // per-scene audio file — image stays until this finishes
}

// Splits text into at most 2 lines of maxLen characters each.
// Long narrations are truncated with "…" to prevent subtitles covering the video.
function wrapText(text: string, maxLen = 72): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      if (current) lines.push(current.trim());
      if (lines.length >= 2) break; // hard cap at 2 lines
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current && lines.length < 2) lines.push(current.trim());

  // Truncate the last line if text was cut off
  const full = text.trim();
  const wrapped = lines.join(" ");
  if (wrapped.length < full.length - 4) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\W+$/, "") + "…";
  }

  return lines.join("\n");
}

// Renders each scene as an individual MP4 clip.
// Image stays on screen for exactly as long as the per-scene audio takes —
// no more desync between voiceover and visuals.
export async function renderScenes(scenes: SceneAsset[]): Promise<string[]> {
  const scenesDir = path.resolve("./tmp/scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const outputs: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const output = path.join(scenesDir, `scene_${i}.mp4`);

    // Write wrapped subtitle text to a file.
    // textfile= avoids all shell/filter escaping issues with special characters.
    const captionPath = path.join(scenesDir, `scene_${i}_caption.txt`);
    fs.writeFileSync(captionPath, wrapText(s.narration, 52));

    const vf = [
      "scale=1280:720",
      "zoompan=z='min(zoom+0.0008,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
      `drawtext=textfile='${captionPath.replace(/\\/g, "/")}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=h-text_h-40`,
    ].join(",");

    const cmd = [
      "ffmpeg -y",
      `-loop 1 -i "${s.imagePath}"`,
      `-i "${s.audioPath}"`,
      `-vf "${vf}"`,
      `-c:v libx264 -preset ultrafast`,
      `-pix_fmt yuv420p`,
      `-c:a aac -b:a 128k`,
      `-shortest`,
      `"${output}"`,
    ].join(" ");

    console.log(`Rendering scene ${i + 1}/${scenes.length}`);
    execSync(cmd, { stdio: "inherit" });
    outputs.push(output);
  }

  return outputs;
}

// Renders the ByteForge outro card with channel logo overlay and a voiceover.
// audioPath: ElevenLabs-generated outro audio (.mp3)
// logoPath: channel logo PNG (apps/worker/assets/logo.png)
// Duration is driven by the audio length via -shortest.
export async function renderOutro(audioPath: string, logoPath: string): Promise<string> {
  const scenesDir = path.resolve("./tmp/scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const output = path.join(scenesDir, "outro.mp4");

  // Scale logo to 180×180, overlay it centered-upper, add channel name + CTA below.
  // Using filter_complex with three inputs: [0]=bg colour, [1]=audio, [2]=logo.
  const filterComplex = [
    `[2:v]scale=180:180[logo]`,
    `[0:v][logo]overlay=(W-w)/2:(H-h)/2-80[bg_logo]`,
    `[bg_logo]drawtext=text='ByteForge':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h/2)+60[vt1]`,
    `[vt1]drawtext=text='Subscribe for more':fontcolor=0xaaaaaa:fontsize=30:x=(w-text_w)/2:y=(h/2)+115[vout]`,
  ].join(";");

  const cmd = [
    "ffmpeg -y",
    "-f lavfi -i color=c=0x0d1117:size=1280x720:rate=25",
    `-i "${audioPath.replace(/\\/g, "/")}"`,
    `-i "${logoPath.replace(/\\/g, "/")}"`,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]"`,
    `-map 1:a`,
    "-c:v libx264 -preset ultrafast -pix_fmt yuv420p",
    "-c:a aac -b:a 128k",
    "-shortest",
    `"${output}"`,
  ].join(" ");

  console.log("Rendering ByteForge outro with logo and voiceover...");
  execSync(cmd, { stdio: "inherit" });
  return output;
}

// Concatenates all scene clips (including outro) into the final video.
export async function concatScenes(sceneFiles: string[]): Promise<string> {
  const listPath = path.resolve("./tmp/concat_list.txt");
  const output = path.resolve("./tmp/final.mp4");

  fs.writeFileSync(
    listPath,
    sceneFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n")
  );

  console.log(`Concatenating ${sceneFiles.length} clips into final.mp4...`);

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k "${output}"`,
    { stdio: "inherit" }
  );

  return output;
}
