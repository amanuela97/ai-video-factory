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

// Splits text into lines of at most maxLen characters, breaking on word boundaries.
// FFmpeg textfile= supports newlines and renders each line separately.
function wrapText(text: string, maxLen = 52): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current.trim());
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
      "scale=1920:1080",
      "zoompan=z='min(zoom+0.0008,1.08)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
      // Padded x so subtitle never touches the edge; centered using text_w
      `drawtext=textfile='${captionPath.replace(/\\/g, "/")}':fontcolor=white:fontsize=34:line_spacing=8:box=1:boxcolor=black@0.65:boxborderw=14:x=(w-text_w)/2:y=h-text_h-60`,
    ].join(",");

    const cmd = [
      "ffmpeg -y",
      `-loop 1 -i "${s.imagePath}"`,  // static image
      `-i "${s.audioPath}"`,           // per-scene audio — -shortest stops when audio ends
      `-vf "${vf}"`,
      `-c:v libx264 -preset fast`,
      `-pix_fmt yuv420p`,
      `-c:a aac -b:a 192k`,
      `-shortest`,
      `"${output}"`,
    ].join(" ");

    console.log(`Rendering scene ${i + 1}/${scenes.length}`);
    execSync(cmd, { stdio: "inherit" });
    outputs.push(output);
  }

  return outputs;
}

// Renders a 6-second ByteForge outro card — dark background, channel name,
// subscribe call-to-action. Uses a static textfile so no escaping issues.
export async function renderOutro(): Promise<string> {
  const scenesDir = path.resolve("./tmp/scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const output = path.join(scenesDir, "outro.mp4");
  const captionPath = path.join(scenesDir, "outro_caption.txt");

  // Two-line outro text
  fs.writeFileSync(captionPath, "ByteForge\nSubscribe for more!");

  const vf = [
    // Dark navy background drawn over the (empty) input
    "drawbox=x=0:y=0:w=iw:h=ih:color=0x0d1117:t=fill",
    `drawtext=textfile='${captionPath.replace(/\\/g, "/")}':fontcolor=white:fontsize=72:line_spacing=20:x=(w-text_w)/2:y=(h-text_h)/2`,
  ].join(",");

  const cmd = [
    "ffmpeg -y",
    "-f lavfi -i color=c=black:size=1920x1080:rate=30",
    "-f lavfi -i anullsrc=r=44100:cl=stereo",
    "-t 6",
    `-vf "${vf}"`,
    "-c:v libx264 -preset fast -pix_fmt yuv420p",
    "-c:a aac -b:a 192k",
    "-shortest",
    `"${output}"`,
  ].join(" ");

  console.log("Rendering ByteForge outro...");
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
