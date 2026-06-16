import { nichePrompts, detectNiche } from "./niches";

export function buildGeminiPrompt(topic: string, durationSeconds: number): string {
  const niche = detectNiche(topic);
  const style = nichePrompts[niche];

  return `You are a world-class YouTube retention strategist and educational script director.

Your job is to create highly engaging educational videos that maximize watch time, retention, and curiosity.
You are NOT writing a lecture. You are writing a story-driven visual experience.

NICHE: ${niche}
HOOK STYLE: ${style.hookStyle}
TONE: ${style.tone}
PACING: ${style.pacing}

OUTPUT MUST BE STRICT JSON ONLY. No markdown, no explanation, no code fences, no extra text.

HARD RULES:
- Must fully cover exactly ${durationSeconds} seconds total (last scene.end must equal ${durationSeconds})
- Scenes must be 12-20 seconds each (no longer, no shorter)
- Maximum 15 scenes total regardless of duration
- No filler scenes
- Every scene must advance understanding OR curiosity
- Every 2-3 scenes must introduce a curiosity gap

RETENTION STRATEGY (MANDATORY):
1. OPEN LOOP: introduce unanswered questions early, delay payoff
2. MICRO-REWARDS: every scene reveals something new
3. CONTRAST: show wrong vs right, or before vs after
4. PROGRESSIVE COMPLEXITY: each scene slightly increases depth
5. PAYOFF ENDING: final 2 scenes MUST resolve all open loops and deliver a satisfying conclusion

CONCLUSION RULES (HARD):
- The second-to-last scene must summarize the key insight
- The last scene must deliver the final payoff / "now you know" moment
- The video must NOT end mid-explanation or mid-thought
- Every open question introduced earlier MUST be answered before the end

HOOK RULE: First 10 seconds MUST contain a surprising fact, contradiction, or shocking simplification.

VISUAL STYLE (HARD LOCK - DO NOT DEVIATE):
- 16:9 widescreen
- MS Paint childish stick figures
- thick wobbly black outlines
- flat colors only, white background
- minimal composition, centered objects
- dot eyes, line bodies, simple geometric props
- NO realism, NO gradients, NO shading, NO 3D

VISUAL RULES:
- Every visual must be concrete (objects, actions - not abstract concepts)
- Always describe what characters are DOING
- Always include at least 1 object per scene
- Avoid abstract visuals unless absolutely necessary

Topic: ${topic}
Target duration: ${durationSeconds} seconds

OUTPUT FORMAT (strict JSON - no other text):
{
  "title": "string",
  "duration_seconds": ${durationSeconds},
  "scenes": [
    {
      "start": 0,
      "end": 8,
      "narration": "string",
      "visual_prompt": "string",
      "curiosity_hook": "string",
      "retention_reason": "string"
    }
  ]
}`;
}
