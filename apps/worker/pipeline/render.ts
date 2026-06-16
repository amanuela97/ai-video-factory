import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface SceneAsset {
  start: number;
  end: number;
  narration: string;
  imagePath: string;
  fullAudioPath: string; // single full narration MP3 — FFmpeg extracts the right segment
}

// Renders each scene as an individual MP4 clip.
// Each clip: still image with Ken Burns zoom + audio segment extracted from the full narration track + burned subtitle.
export async function renderScenes(scenes: SceneAsset[]): Promise<string[]> {
  const scenesDir = path.resolve("./tmp/scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const outputs: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const duration = s.end - s.start;
    const output = path.join(scenesDir, `scene_${i}.mp4`);

    // Write subtitle text to a file so FFmpeg reads it directly.
    // This avoids all shell/filter escaping issues with %, :, ', , and other
    // special characters that AI-generated text commonly contains.
    const captionPath = path.join(scenesDir, `scene_${i}_caption.txt`);
    fs.writeFileSync(captionPath, s.narration.slice(0, 120));

    // Build video filter chain:
    // 1. scale to 1920x1080
    // 2. zoompan: subtle Ken Burns zoom-in effect (zoom from 1.0 to 1.08 over the scene)
    // 3. drawtext: burned-in subtitle using textfile= (safe for any text content)
    const vf = [
      "scale=1920:1080",
      "zoompan=z='min(zoom+0.0008,1.08)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
      `drawtext=textfile='${captionPath.replace(/\\/g, "/")}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-th-50`,
    ].join(",");

    const cmd = [
      "ffmpeg -y",
      `-loop 1 -i "${s.imagePath}"`,
      `-ss ${s.start} -t ${duration} -i "${s.fullAudioPath}"`,
      `-t ${duration}`,
      `-vf "${vf}"`,
      `-c:v libx264`,
      `-pix_fmt yuv420p`,
      `-c:a aac -b:a 192k`,
      `-shortest`,
      `"${output}"`,
    ].join(" ");

    console.log(`Rendering scene ${i + 1}/${scenes.length} (${duration}s)`);
    execSync(cmd, { stdio: "inherit" });
    outputs.push(output);
  }

  return outputs;
}

// Concatenates all scene clips into the final video.
// Re-encodes instead of stream-copying to guarantee audio/video sync.
export async function concatScenes(sceneFiles: string[]): Promise<string> {
  const listPath = path.resolve("./tmp/concat_list.txt");
  const output = path.resolve("./tmp/final.mp4");

  // Write ffmpeg concat list — each line: file 'path/to/scene.mp4'
  fs.writeFileSync(
    listPath,
    sceneFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n")
  );

  console.log(`Concatenating ${sceneFiles.length} scenes into final.mp4...`);

  // Re-encode on concat for reliable audio sync (not -c copy which can cause A/V desync)
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k "${output}"`,
    { stdio: "inherit" }
  );

  return output;
}
