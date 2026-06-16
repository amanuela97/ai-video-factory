export interface NicheConfig {
  hookStyle: string;
  tone: string;
  pacing: string;
}

export const nichePrompts: Record<string, NicheConfig> = {
  finance: {
    hookStyle: "contrarian financial insight or myth debunking",
    tone: "simple, practical, slightly dramatic",
    pacing: "slow clarity → fast insight spikes",
  },
  tech: {
    hookStyle: "surprising system behavior or hidden mechanism",
    tone: "curious, explanatory, slightly geeky",
    pacing: "concept → breakdown → visual analogy",
  },
  teded: {
    hookStyle: "story-based curiosity question",
    tone: "storytelling, emotional curiosity",
    pacing: "narrative → explanation → payoff",
  },
};

export function detectNiche(topic: string): keyof typeof nichePrompts {
  const t = topic.toLowerCase();

  if (
    t.includes("stock") ||
    t.includes("money") ||
    t.includes("interest") ||
    t.includes("invest") ||
    t.includes("inflation") ||
    t.includes("bank") ||
    t.includes("tax") ||
    t.includes("budget") ||
    t.includes("debt") ||
    t.includes("loan")
  ) {
    return "finance";
  }

  if (
    t.includes("code") ||
    t.includes("ai") ||
    t.includes("web") ||
    t.includes("software") ||
    t.includes("algorithm") ||
    t.includes("computer") ||
    t.includes("internet") ||
    t.includes("programming") ||
    t.includes("machine learning")
  ) {
    return "tech";
  }

  return "teded";
}
