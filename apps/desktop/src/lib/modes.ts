export type ModeId = "rephrase" | "email" | "message" | "reply" | "shorten" | "fix" | "ask";
export type Tone = "casual" | "neutral" | "warm" | "direct" | "formal";

export interface Mode {
  id: ModeId;
  label: string;
  placeholder: string;
  notePlaceholder: string;
  task: string;
  usesTone: boolean;
}

export const MODES: Mode[] = [
  {
    id: "rephrase",
    label: "Rephrase",
    placeholder: "paste or type what you want said better…",
    notePlaceholder: "anything specific? (less pushy, mention the deadline…)",
    task: "Rephrase the text so it reads clearly and naturally. Keep roughly the same length and format.",
    usesTone: true,
  },
  {
    id: "email",
    label: "Email",
    placeholder: "the gist. who it's to, what you need. messy is fine.",
    notePlaceholder: "who's it for? (my manager, a new client…)",
    task:
      "Turn the notes into a complete email. First line: 'Subject: …'. Then a blank line, a greeting, " +
      "a concise body in short paragraphs, and a sign-off line. Do not invent a sender name.",
    usesTone: true,
  },
  {
    id: "message",
    label: "Message",
    placeholder: "what do you want to say?",
    notePlaceholder: "where's it going? (slack, whatsapp, linkedin…)",
    task:
      "Turn the notes into a chat message (Slack, Teams, WhatsApp, iMessage). Short and skimmable, " +
      "no subject line, no formal sign-off. Use line breaks if there are several points.",
    usesTone: true,
  },
  {
    id: "reply",
    label: "Reply",
    placeholder: "paste the message you got…",
    notePlaceholder: "what do you want to say back? (yes, but friday works better)",
    task:
      "The text is a message the author received. Write the author's reply to it, answering what was asked. " +
      "Follow the author's intent from the note. Do not quote or repeat the original message.",
    usesTone: true,
  },
  {
    id: "shorten",
    label: "Shorter",
    placeholder: "paste the wall of text…",
    notePlaceholder: "how short? (one line, under 50 words…)",
    task: "Make the text noticeably shorter, about half, while keeping every important point.",
    usesTone: true,
  },
  {
    id: "fix",
    label: "Fix",
    placeholder: "paste text to clean up…",
    notePlaceholder: "anything to leave alone?",
    task:
      "Fix grammar, spelling and punctuation only. Keep the wording, tone and structure unless a change " +
      "is required for correctness.",
    usesTone: false,
  },
  {
    id: "ask",
    label: "Ask",
    placeholder: "the text to work on (optional)…",
    notePlaceholder: "what should I do with it? (turn into bullet points…)",
    task: "Follow the author's instruction.",
    usesTone: false,
  },
];

export const TONES: { id: Tone; label: string; rule: string }[] = [
  { id: "casual", label: "casual", rule: "casual and relaxed, like texting a colleague you like. Contractions are good." },
  { id: "neutral", label: "neutral", rule: "clear, friendly and professional." },
  { id: "warm", label: "warm", rule: "warm and kind, appreciative without being gushy." },
  { id: "direct", label: "direct", rule: "direct and concise. No softeners, no filler." },
  { id: "formal", label: "formal", rule: "formal and polished, suitable for clients or leadership." },
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0];

const BASE = `You are unblurt, a writing assistant that turns messy thoughts into clear, ready-to-send writing.
Rules:
- Return ONLY the final text. No preamble, no surrounding quotes, no markdown code fences, no explanations, no alternatives.
- Keep the author's meaning, facts, names and numbers. Never invent details such as dates, prices or promises; if something essential is missing, leave a short [placeholder].
- Write like a thoughtful person, not like an AI. Avoid stock phrases such as "I hope this email finds you well" or "I wanted to reach out".
- Reply in the same language as the text.`;

export function buildPrompt(opts: { mode: ModeId; tone: Tone; input: string; note: string }) {
  const mode = modeById(opts.mode);
  const lines = [BASE, "", `Task: ${mode.task}`];
  if (mode.usesTone) lines.push(`Tone: ${TONES.find((t) => t.id === opts.tone)!.rule}`);

  const parts: string[] = [];
  if (opts.input.trim()) parts.push(`<text>\n${opts.input.trim()}\n</text>`);
  if (opts.note.trim()) {
    const label = opts.mode === "reply" ? "What I want to say back" : opts.mode === "ask" ? "Instruction" : "Note from me";
    parts.push(`${label}: ${opts.note.trim()}`);
  }
  return { system: lines.join("\n"), prompt: parts.join("\n\n") };
}

// Models sometimes wrap answers despite instructions; peel that off.
export function cleanOutput(raw: string) {
  let s = raw.trim();
  const fence = s.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (fence) s = fence[1].trim();
  s = s.replace(/^(here(?:'|’)s|here is|sure[,!]?)[^\n]{0,80}:\s*\n+/i, "");
  if (/^["“].*["”]$/s.test(s) && !/["“”]/.test(s.slice(1, -1))) s = s.slice(1, -1);
  return s.trim();
}
