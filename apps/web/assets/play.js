// The interactive bits on the home page:
//   Try it        your own text, tidied by a demo rewriter right here (no AI, nothing sent), plus a "how blurty" score
//   Share card    a 1200x630 PNG of your score (your text is blurred on it), shared or saved
//   Daily         blurt of the day: drag the line or press the real shortcut to unblur it
//   Ticker, wall  "N unblurred this week" and the reviewed before/after wall (api/stats.js, api/wall.js)
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMac = /Mac/.test(navigator.platform || navigator.userAgent);
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------------------------------------------------------------- blurts
  // One a day, in order, forever. Pairs are close in length so the slider reads well.
  const BLURTS = [
    ["To your manager", "Slack, 9:41", "ok so basically i think we prob cant hit friday bc design is still kinda moving?? maybe tues", "Friday is at risk because the designs are still changing. Tuesday looks realistic."],
    ["To a client", "Email, Monday", "hey just circling back on the invoice from last month, not sure if u saw it, no rush but kinda need it", "Following up on last month's invoice. Could you let me know when it will be paid?"],
    ["To the group chat", "Messages, 18:02", "running sooo late sorry sorry traffic is insane start without me ill be there in like 20", "Running about 20 minutes late because of traffic. Start without me."],
    ["To a recruiter", "LinkedIn, 11:15", "hi thx for reaching out, i mean im kinda happy where i am rn but open to hearing more i guess", "Thanks for reaching out. I'm happy where I am, but I'm open to hearing more."],
    ["To your landlord", "Text, 08:30", "hey so the sink thing is happening again, water everywhere lol, can someone maybe come look at it", "The sink is leaking again and there's water on the floor. Could someone come and look at it?"],
    ["To your team", "Slack, 16:47", "quick q, did anyone actually decide on the thing from the meeting or are we still just vibing", "Did we make a decision on the item from today's meeting, or is it still open?"],
    ["To a friend", "WhatsApp, 21:10", "omg im so sorry i totally forgot ur bday i am the worst, drinks on me this week i promise", "I'm so sorry I missed your birthday. Drinks are on me this week, I promise."],
    ["To support", "Chat, 14:22", "so ive been charged twice?? for the same thing?? pls fix asap this is like the 2nd time", "I've been charged twice for the same order, and it's the second time this has happened. Please refund the duplicate."],
    ["To your manager", "Slack, 10:05", "can i maybe take friday off? i know its short notice sorry, ill make sure everything is covered", "Could I take Friday off? I know it's short notice, and I'll make sure everything is covered."],
    ["To a new colleague", "Slack, 09:12", "hey welcome!! if u need anything at all literally just ping me, im around most of the day", "Welcome to the team! Ping me if you need anything. I'm around most of the day."],
    ["To a vendor", "Email, Thursday", "so the delivery was supposed to be tues and its thurs and nothing?? whats going on", "The delivery was due Tuesday and still hasn't arrived. Can you tell me where it is?"],
    ["To your partner", "Messages, 17:30", "cant do dinner at 7 anymore work is being work, 8 ok? sorry, love u", "Work ran over, so 7 won't work for dinner. Is 8 okay? Sorry, love you."],
    ["To your team", "Slack, 12:00", "just a heads up i think the deploy might break stuff idk, can someone who knows the thing check", "Heads up: the deploy might break something. Could someone familiar with it take a look?"],
    ["To a professor", "Email, Sunday", "hi sorry to bother u but i was sick and missed the deadline, is there any way i could still submit", "I was ill and missed the deadline. Would it be possible to submit the assignment late?"],
    ["To a neighbour", "Note, 19:45", "hey so the music last night was kinda loud like super late, would be cool if maybe it was quieter", "The music was quite loud late last night. Could you keep it down after 11?"],
    ["To your manager", "Slack, 15:20", "so i kinda finished the report early? lmk if u want me to pick up something else", "I've finished the report early. Let me know if you'd like me to pick up something else."],
    ["To an investor", "Email, Tuesday", "quick update we basically doubled users this month which is crazy, happy to share more if useful", "Quick update: users doubled this month. Happy to share the details if useful."],
    ["To a friend", "Messages, 13:13", "hey are we still on for sat? i might be a bit late tho bc of the thing, ill text u", "Are we still on for Saturday? I might be a little late, so I'll text you."],
    ["To a client", "Email, Friday", "so we need to push the launch a bit, sorry, its not ideal i know but the qa stuff is taking forever", "We need to move the launch back a little. QA is taking longer than planned, and I'm sorry for the delay."],
    ["To your team", "Slack, 08:55", "im gonna be offline for like an hour, dentist ugh, ping me if anything is on fire", "I'll be offline for about an hour for a dentist appointment. Ping me if anything urgent comes up."],
    ["To HR", "Email, Wednesday", "hi so i think my payslip is wrong?? the overtime isnt on it, not sure who to ask", "My payslip seems to be missing my overtime. Could you check it, or point me to the right person?"],
    ["To your manager", "Slack, 17:58", "honestly i think the plan wont work, like i dont want to be negative but the numbers dont add up", "I don't think the plan works as it stands. The numbers don't add up, and I'd like to talk it through."],
    ["To a friend", "WhatsApp, 22:40", "sorry ive been so bad at replying lately things are kinda crazy, miss u tho, call this week?", "Sorry I've been slow to reply. Things have been hectic. I miss you. Call this week?"],
    ["To a hiring manager", "Email, Monday", "hi just wanted to check if theres any update on the role, no worries if not, just curious", "Is there any update on the role? I'm still very interested."],
    ["To your team", "Slack, 11:11", "so who broke the build lol, not mad just need it fixed before the demo at 2 pls", "The build is broken. Could whoever is closest to it fix it before the 2pm demo?"],
    ["To a contractor", "Text, 07:50", "hey can u come wed instead of tues? sorry for the switch, something came up", "Could you come on Wednesday instead of Tuesday? Sorry for the change."],
    ["To your manager", "Slack, 14:05", "i think i need help with the migration tbh, its way bigger than we thought and im kinda stuck", "I need help with the migration. It's much bigger than we estimated, and I'm stuck."],
    ["To a customer", "Email, Thursday", "so sorry about the mix up!! we sent the wrong size, new one is going out today, u can keep the other", "Sorry for the mix-up with the size. The right one ships today, and you can keep the other."],
    ["To your team", "Slack, 18:30", "ok i think thats it for today, great work everyone fr, lets pick it up tmrw", "That's it for today. Great work, everyone. Let's pick it up tomorrow."],
    ["To yourself", "Notes, 23:59", "buy milk, call mum, fix the thing, reply to that email, idk sleep maybe", "Buy milk. Call Mum. Fix the bug. Reply to the email. Sleep."],
  ];

  // ---------------------------------------------------------------- the score
  const FILLERS = /\b(basically|literally|actually|honestly|like|just|kinda|kind of|sorta|sort of|really|very|totally|so+|um+|uh+|anyway|i mean|you know|tbh|fr|lol|lmao|ngl|idk|ugh|omg)\b/gi;
  const SORRY = /\b(sorry|apologi[sz]e|apologies|my bad|sorry to bother)\b/gi;
  const HEDGES = /\b(i think|i guess|i feel like|not sure|just wanted to|no worries if not|no rush)\b/gi;
  const SOFT = /\b(maybe|probably|prob|perhaps|hopefully|might be)\b/gi;
  const TXT = /\b(u|ur|bc|cuz|pls|plz|thx|tmrw|rn|gonna|wanna|gotta|lmk|q|asap|w\/e|smth|sth)\b/gi;

  function score(raw) {
    const text = raw.trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 3) return { score: 0, flags: [], words: words.length };
    const count = (re) => (text.match(re) || []).length;
    const fillers = count(FILLERS);
    const sorry = count(SORRY);
    const hedges = count(HEDGES);
    const soft = count(SOFT);
    const txt = count(TXT);
    const shouty = count(/([?!])\1+/g);
    const lowerI = count(/(^|\s)i(\s|'|$)/g);
    const sentences = text.split(/[.!?]+\s|\n+/).map((s) => s.trim()).filter(Boolean);
    const runOn = sentences.filter((s) => s.split(/\s+/).length > 28).length;
    const noCaps = /^[a-z]/.test(text) ? 1 : 0;
    const noEnd = /[a-z0-9]$/i.test(text) && words.length > 6 ? 1 : 0;

    const per = 100 / Math.max(words.length, 8);
    const raw_ = (fillers * 2.2 + sorry * 3 + hedges * 2.4 + soft * 1.1 + txt * 2.6 + shouty * 3 + lowerI * 1.6) * per + runOn * 14 + noCaps * 8 + noEnd * 5;
    // a soft curve: messy text climbs fast, but only a real wall of blurt gets near 99
    const s = Math.max(0, Math.min(99, Math.round(100 * (1 - Math.exp(-raw_ / 70)))));

    const flags = [
      [fillers, "filler", "fillers"], [hedges + soft, "hedge", "hedges"], [sorry, "sorry", "sorrys"], [txt, "txt-speak", "txt-speak"],
      [shouty, "?!? pile", "?!? piles"], [runOn, "run-on", "run-ons"], [lowerI, "lowercase i", "lowercase i's"],
    ].filter(([n]) => n > 0).map(([n, one, many]) => ({ n, label: n === 1 ? one : many }));
    return { score: s, flags, words: words.length };
  }
  const verdict = (s, words) =>
    words < 3 ? "type something messy" :
    s < 12 ? "crisp. barely a blur." :
    s < 30 ? "a little blurry." :
    s < 55 ? "pretty blurty." :
    s < 80 ? "very blurty." : "full blurt.";

  // ---------------------------------------------------------------- demo rewriter
  // The Try it box runs entirely in the browser: no AI, no server, nothing leaves the page.
  // Built-in blurts get their hand-written clean version; anything else gets a rule-based tidy-up
  // (txt-speak, fillers, contractions, capitals, punctuation). The real app uses a real model.
  const WORDS = {
    u: "you", ur: "your", bc: "because", cuz: "because", coz: "because", pls: "please", plz: "please", thx: "thanks", ty: "thank you",
    tmrw: "tomorrow", tmr: "tomorrow", rn: "right now", lmk: "let me know", prob: "probably", probs: "probably", gonna: "going to",
    wanna: "want to", gotta: "have to", asap: "as soon as possible", smth: "something", sth: "something", bday: "birthday",
    mins: "minutes", min: "minutes", hr: "hour", hrs: "hours", msg: "message", ppl: "people", abt: "about", w: "with", b4: "before",
    mon: "Monday", tues: "Tuesday", tue: "Tuesday", weds: "Wednesday", wed: "Wednesday", thurs: "Thursday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
    cant: "can't", dont: "don't", wont: "won't", isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't", didnt: "didn't",
    doesnt: "doesn't", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't", havent: "haven't", hasnt: "hasn't",
    im: "I'm", ive: "I've", youre: "you're", theyre: "they're", thats: "that's", whats: "what's", theres: "there's", heres: "here's",
    recieve: "receive", tomorow: "tomorrow", definately: "definitely", seperate: "separate", untill: "until", alot: "a lot", wierd: "weird", occured: "occurred",
  };
  const DAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december)\b/g;
  const QWORD = /^(who|what|when|where|why|how|is|are|am|can|could|do|does|did|will|would|should|any|anyone|has|have|was|were)\b/i;

  function tidy(t) {
    return t
      .replace(/[ \t]+/g, " ")
      .replace(/ +([,.!?;:])/g, "$1")
      .replace(/([,;:])(?=\S)/g, "$1 ")
      .replace(/,\s*([.!?])/g, "$1")
      .replace(/^[\s,;:]+/gm, "")
      .replace(/([.!?])\s*,/g, "$1")
      .trim();
  }
  function sentences(t) {
    // capitals at sentence starts, "i" as "I", a full stop at the end of each line
    return t.split("\n").map((line) => {
      let l = line.trim();
      if (!l) return "";
      l = l.replace(/^sorry\s+(?=i\b)/i, "sorry, ");
      // "..., can you call me" -> "... . Can you call me?"
      l = l.replace(/,\s+((?:can|could|would|will|do|did|are|is) (?:you|we|someone|anyone)\b[^.!?]*)[.!?]?$/i, ". $1?");
      // "have you had a chance to look at X, it would be great..." -> question, then the rest
      l = l.replace(/^(have you had a chance to [^,.!?]+),\s*/i, "$1? ");
      l = l.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, c) => a + c.toUpperCase());
      l = l.replace(/\bi\b/g, "I").replace(/\bi'(m|ve|ll|d)\b/g, "I'$1");
      if (!/[.!?:)]$/.test(l)) l += ".";
      return l;
    }).join("\n");
  }
  function demoRewrite(raw, mode) {
    const hand = BLURTS.find((b) => b[2].trim().toLowerCase() === raw.trim().toLowerCase());
    if (hand && mode !== "fix") return hand[3];

    let t = " " + raw.replace(/\r\n?/g, "\n") + " ";
    t = t.replace(/([a-z])\1{2,}/gi, "$1"); // sooo -> so
    t = t.replace(/\b(w\/)/gi, "with ");
    t = t.replace(/\b[a-z0-9]+\b/gi, (w) => {
      const lower = w.toLowerCase();
      if (WORDS[lower] === undefined) return w;
      if (lower === "idk") return w;
      return WORDS[lower];
    });
    t = t.replace(DAYS, (d) => d[0].toUpperCase() + d.slice(1));
    t = t.replace(/\bill\b(?= (be|do|send|check|call|text|get|let|make|try|have|come|see|look|pick|ping|take))/g, "I'll");
    t = t.replace(/\blike (\d)/gi, "about $1").replace(/\bsuper (?=\w)/gi, "very ");
    t = t.replace(/\btheir (?=(going|coming|not|here|there|on|in|at|always|still|already|probably|all|right|late|done)\b)/gi, "they're ");
    t = t.replace(/\byour (?=(welcome|right|going|not|the best|late|done)\b)/gi, "you're ");
    t = t.replace(/\bits (?=(a|been|not|going|okay|ok|fine|time|so|too|all|my|your|been)\b)/gi, "it's ");
    t = t.replace(/\b(running|be|i'm|im) late (\d+ (?:minutes|hours?|min|mins))\b/gi, (m, a, n) => `${a} about ${n} late,`);
    t = t.replace(/\bno rush but\b/gi, "no rush, but").replace(/(,|\bbut)\s*would be\b/gi, "$1 it would be").replace(/(^|[.!?]\s+)would be\b/gi, "$1it would be");
    t = t.replace(/\b(?:i )?(?:just )?wanted to (?:check|see|ask) if (?:you|u) had a chance to\b/gi, "have you had a chance to");
    // ?? and !! piles: a question stays a question, a statement gets a full stop
    t = t.replace(/([^.!?\n]*?)[?!]{2,}/g, (m, clause) => clause + (QWORD.test(clause.trim().replace(/^(and|but|so|ok|okay|hey|hi)\s+/i, "")) ? "?" : "."));
    t = t.replace(/\.{2,}/g, ".");

    if (mode === "fix") {
      t = t.replace(/\bidk\b/gi, "I don't know");
      return sentences(tidy(t));
    }

    // Rephrase: drop the filler and the noise
    t = t.replace(/^\s*(hey|hi|hello)?\s*(ok|okay)?\s*(so)\b,?/i, " ");
    t = t.replace(/\b(basically|literally|honestly|actually|totally|kinda|kind of|sorta|sort of|just|really|tbh|fr|ngl|lol|lmao|omg|ugh|um+|uh+|idk|i mean|you know|anyway)\b/gi, "");
    t = t.replace(/\b(could|would|should|can|will|maybe|was|is|it's|just|and|so)\s+like\b,?/gi, "$1").replace(/,\s*like,/gi, ",");
    t = t.replace(/\bvery (very )+/gi, "very ").replace(/^\s*like\b,?\s*/i, " ");
    if (mode === "shorter") {
      t = t.replace(/\b(sorry,? ?)+(to bother you,?)?/gi, "");
      t = t.replace(/\b(i think|i guess|i feel like|i was thinking|i was wondering if|just wanted to say|no worries if not|no rush,?( but)?|if that makes sense|for what it's worth)\b,?/gi, "");
      t = t.replace(/\b(that|which) is\b/gi, "");
      t = t.replace(/\b(in order to)\b/gi, "to").replace(/\bat this point in time\b/gi, "now").replace(/\bdue to the fact that\b/gi, "because");
    } else {
      t = t.replace(/\b(sorry,? ?){2,}/gi, "sorry ");
      t = t.replace(/\b(i think|i guess|i feel like)\s+(?=(we|it|this|that|they|you|i|the)\b)/gi, "");
      t = t.replace(/([.!?]\s+|^\s*)sorry,\s*(?=maybe|but)/gi, "$1");
    }
    return sentences(tidy(t));
  }

  // ---------------------------------------------------------------- Try it
  const tryRoot = $(".try");
  const input = $('[data-try="input"]');
  const shared = { score: 0, verdict: "", text: "", after: null };

  if (tryRoot && input) {
    const el = (k) => $(`[data-try="${k}"]`);
    const go = el("go"), countEl = el("count"), msg = el("msg"), out = el("result"), work = el("working");
    const scoreEl = el("score"), verdictEl = el("verdict"), meter = el("meter"), flagsEl = el("flags");
    const shareBtn = el("share"), saveBtn = el("save"), wallBtn = el("wall"), copyBtn = el("copy");
    let mode = "rephrase";
    let shown = 0;
    let lastPair = null;

    const setMode = (m) => {
      mode = m;
      $$(".try-modes [data-mode]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.mode === m)));
    };
    $$(".try-modes [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

    const animateNumber = (to) => {
      const from = shown;
      shown = to;
      if (reduced || from === to) { scoreEl.textContent = to; return; }
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 380);
        scoreEl.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    let lastFlags = "";
    const rescore = () => {
      const text = input.value;
      const r = score(text);
      animateNumber(r.score);
      const v = verdict(r.score, r.words);
      if (verdictEl.textContent !== v) verdictEl.textContent = v;
      meter.style.width = `${Math.max(r.words >= 3 ? 3 : 0, r.score)}%`;
      meter.className = r.score >= 55 ? "hot" : r.score >= 30 ? "warm" : "";
      const key = r.flags.map((f) => f.n + f.label).join("|");
      if (key !== lastFlags) {
        lastFlags = key;
        flagsEl.replaceChildren(...r.flags.slice(0, 5).map((f) => {
          const li = document.createElement("li");
          const b = document.createElement("b");
          b.textContent = f.n;
          li.append(b, f.label);
          return li;
        }));
      }
      const len = text.length;
      countEl.textContent = `${len} / 600`;
      countEl.classList.toggle("near", len > 540);
      go.disabled = !text.trim();
      shareBtn.disabled = saveBtn.disabled = r.words < 3;
      Object.assign(shared, { score: r.score, verdict: v, text: text.trim() });
    };
    input.addEventListener("input", () => { shared.after = null; rescore(); });
    rescore();

    let sample = Math.floor(Math.random() * BLURTS.length);
    el("sample").addEventListener("click", () => {
      sample = (sample + 1) % BLURTS.length;
      input.value = BLURTS[sample][2];
      shared.after = null;
      rescore();
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });

    const say = (html) => {
      msg.innerHTML = html;
      msg.hidden = !html;
    };
    const download = '<a href="/download">Get the app</a>';

    async function run() {
      const text = input.value.trim();
      if (!text || tryRoot.classList.contains("busy")) return;
      tryRoot.classList.add("busy");
      go.disabled = true;
      out.hidden = true;
      say("");
      work.hidden = false;
      // a short, honest pause so the result lands like the app's popover
      await new Promise((r) => setTimeout(r, reduced ? 0 : 520 + Math.min(600, text.length * 3)));
      try {
        let result;
        try { result = demoRewrite(text, mode); } catch { result = sentences(tidy(text)); }
        if (!result || !result.trim()) result = sentences(tidy(text));
        el("output").textContent = result;
        const after = score(result).score;
        shared.after = after;
        const delta = el("delta");
        delta.innerHTML = "";
        delta.append(`${shared.score}% \u2192 `);
        const b = document.createElement("b");
        b.textContent = `${after}%`;
        delta.append(b, " blurt");
        out.hidden = false;
        copyBtn.textContent = "copy";
        lastPair = { before: text, after: result, mode };
        wallBtn.disabled = false;
        wallBtn.textContent = "add to the wall";
        countUnblur();
        if (matchMedia("(max-width: 860px)").matches) out.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
      } finally {
        work.hidden = true;
        tryRoot.classList.remove("busy");
        go.disabled = !input.value.trim();
      }
    }
    go.addEventListener("click", run);
    input.addEventListener("keydown", (e) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === "Enter" || (e.shiftKey && e.code === "Space"))) {
        e.preventDefault();
        run();
      }
    });


    // ---------------------------------------------------------------- the plate
    // Drag text from anywhere (this page, another tab, another app) onto the box and the plate opens
    // into a drop target, like the real one on your screen edge. Its buttons work too.
    const plate = $("[data-plate]");
    const hint = $("[data-plate-hint]");
    if (plate) {
      const touch = matchMedia("(hover: none)").matches;
      if (touch && hint) hint.textContent = "Or tap the plate on the left: Rephrase, Shorter, or what you last copied.";
      const take = (text, m) => {
        const t = String(text || "").trim().slice(0, 600);
        if (!t) return false;
        input.value = t;
        shared.after = null;
        rescore();
        setMode(m);
        plate.classList.remove("got");
        void plate.offsetWidth;
        plate.classList.add("got");
        run();
        return true;
      };
      const pageSelection = () => {
        const sel = String(window.getSelection ? window.getSelection() : "").trim();
        if (sel) return sel;
        const a = input.selectionStart, b = input.selectionEnd;
        return a !== b ? input.value.slice(a, b) : "";
      };
      $$("[data-plate-act]", plate).forEach((btn) =>
        btn.addEventListener("click", async () => {
          const act = btn.dataset.plateAct;
          if (act === "clipboard") {
            try {
              if (take(await navigator.clipboard.readText(), "rephrase")) return;
            } catch {}
            say("Your browser kept the clipboard private. Paste into the box instead, and the plate takes it from there.");
            input.focus();
            return;
          }
          if (!take(pageSelection() || input.value, act)) {
            say("Select some text first, or type into the box. Then the plate does the rest.");
            input.focus();
          }
        }),
      );

      // drag and drop: anywhere on the Try it area counts, and the plate shows where it lands
      let depth = 0;
      const hasText = (e) => [...(e.dataTransfer?.types || [])].some((t) => t === "text/plain" || t === "text");
      const reset = () => {
        depth = 0;
        tryRoot.classList.remove("dragging");
        plate.classList.remove("over");
      };
      tryRoot.addEventListener("dragenter", (e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        depth++;
        tryRoot.classList.add("dragging");
      });
      tryRoot.addEventListener("dragover", (e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        const r = plate.getBoundingClientRect();
        plate.classList.toggle("over", e.clientX < r.right + 180);
      });
      tryRoot.addEventListener("dragleave", () => {
        depth = Math.max(0, depth - 1);
        if (!depth) reset();
      });
      tryRoot.addEventListener("drop", (e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        reset();
        take(e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text"), "rephrase");
      });
      addEventListener("dragend", reset);
    }

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el("output").textContent);
        copyBtn.textContent = "copied";
      } catch {
        copyBtn.textContent = "select and copy";
      }
    });

    wallBtn.addEventListener("click", async () => {
      if (!lastPair) return;
      wallBtn.disabled = true;
      wallBtn.textContent = "sending…";
      try {
        const r = await fetch("/api/wall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lastPair) });
        wallBtn.textContent = r.ok ? "sent for review. thanks!" : "couldn't send";
        if (!r.ok) wallBtn.disabled = false;
      } catch {
        wallBtn.textContent = "couldn't send";
        wallBtn.disabled = false;
      }
    });

    // ---------------------------------------------------------------- share card
    shareBtn.addEventListener("click", async () => {
      const label = shareBtn.lastChild;
      const text = `My message was ${shared.score}% blurt${shared.after != null ? `. unblurt got it to ${shared.after}%` : ""}. How blurty are you?`;
      const url = "https://unblurt.me/#try";
      try {
        const blob = await card();
        const file = new File([blob], "unblurt-score.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text} ${url}` });
          return;
        }
        if (navigator.share) {
          await navigator.share({ text, url });
          return;
        }
        await navigator.clipboard.writeText(`${text} ${url}`);
        const was = label.textContent;
        label.textContent = " Copied. Paste it anywhere";
        setTimeout(() => (label.textContent = was), 2200);
      } catch (e) {
        if (e?.name !== "AbortError") saveCard();
      }
    });
    const saveCard = async () => {
      const blob = await card();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `unblurt-${shared.score}-percent-blurt.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    saveBtn.addEventListener("click", saveCard);
  }

  // Draws the share card. The visitor's own words appear only blurred, so sharing a score never shares the message.
  let markImg;
  async function card() {
    const W = 1200, H = 630, S = 2;
    const c = document.createElement("canvas");
    c.width = W * S; c.height = H * S;
    const x = c.getContext("2d");
    x.scale(S, S);
    try { await Promise.all([document.fonts.load("500 150px Inter"), document.fonts.load("600 30px Inter")]); } catch {}
    if (!markImg) {
      markImg = new Image();
      markImg.src = "/assets/mark.svg";
      await markImg.decode().catch(() => {});
    }
    const font = (w, px) => `${w} ${px}px Inter, -apple-system, "Segoe UI", sans-serif`;
    const track = (v) => { if ("letterSpacing" in x) x.letterSpacing = v; };
    const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, r) : x.rect(X, Y, w, h); };

    x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);

    // brand row
    if (markImg?.complete) x.drawImage(markImg, 64, 52, 40, 40);
    x.fillStyle = "#101010"; x.font = font(600, 30); track("-1px"); x.textBaseline = "middle";
    x.fillText("unblurt", 114, 73);
    x.font = font(500, 20); x.fillStyle = "#9a948b"; x.textAlign = "right"; track("0px");
    x.fillText("How blurty?", W - 64, 73);
    x.textAlign = "left";

    // their message, blurred, on the stone panel
    x.fillStyle = "#ede6dd"; rr(64, 124, W - 128, 150, 20); x.fill();
    x.save(); rr(64, 124, W - 128, 150, 20); x.clip();
    x.filter = "blur(9px)"; x.fillStyle = "#57534d"; x.font = font(500, 34); track("-0.5px"); x.textBaseline = "alphabetic";
    const words = (shared.text || "ok so basically i think").split(/\s+/);
    let line = "", y = 182;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (x.measureText(t).width > W - 200 && line) { x.fillText(line, 100, y); line = w; y += 46; if (y > 270) break; } else line = t;
    }
    if (y <= 270) x.fillText(line, 100, y);
    x.restore(); x.filter = "none";

    // the number
    x.textBaseline = "alphabetic"; x.fillStyle = "#101010"; x.font = font(500, 168); track("-8px");
    const num = `${shared.score}%`;
    x.fillText(num, 56, 470);
    const nw = x.measureText(num).width;
    x.font = font(500, 64); track("-2.5px"); x.fillStyle = "#ff7a45";
    x.fillText("blurt.", 56 + nw + 26, 470);

    // verdict + url
    x.font = font(500, 28); track("-0.6px"); x.fillStyle = "#57534d";
    const tail = shared.after != null ? `unblurt got it to ${shared.after}%.` : shared.verdict;
    x.fillText(tail, 64, 540);
    x.fillStyle = "#0f6b6a"; x.font = font(600, 28);
    x.fillText("unblurt.me", 64, 580);

    // keycaps, bottom right
    const cap = (X, w, top, mid, wall, label, size) => {
      x.fillStyle = wall; rr(X, 506, w, 66, 14); x.fill();
      const g = x.createLinearGradient(0, 498, 0, 556); g.addColorStop(0, top); g.addColorStop(1, mid);
      x.fillStyle = g; rr(X, 498, w, 62, 14); x.fill();
      x.fillStyle = "#3b3631"; x.font = font(550, size); track("0px"); x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(label, X + w / 2, 530); x.textAlign = "left"; x.textBaseline = "alphabetic";
    };
    cap(W - 64 - 172 - 74 - 74 - 20, 66, "#b0dcd6", "#8fc6bf", "#0b5554", isMac ? "⌘" : "Ctrl", isMac ? 26 : 18);
    cap(W - 64 - 172 - 74 - 10, 66, "#ffc9af", "#ffa982", "#c84b1d", "⇧", 26);
    cap(W - 64 - 172, 172, "#ffffff", "#f4efe8", "#c8bcac", "space", 22);

    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  // ---------------------------------------------------------------- blurt of the day
  const stage = $('[data-daily="stage"]');
  if (stage) {
    const d = (k) => $(`[data-daily="${k}"]`);
    const knob = d("knob");
    const EPOCH = Date.UTC(2026, 10, 10); // No. 1 is 10 Nov 2026
    const touch = matchMedia("(hover: none)").matches;
    const today = Math.max(0, Math.floor((Date.now() - EPOCH) / 864e5));
    let idx = today % BLURTS.length;
    let p = 0;
    let anim = 0;

    const put = (v) => {
      p = Math.max(0, Math.min(100, v));
      stage.style.setProperty("--p", p.toFixed(2));
      knob.setAttribute("aria-valuenow", String(Math.round(p)));
      stage.classList.toggle("at0", p < 4);
      stage.classList.toggle("past", p > 8);
      const done = p >= 99.5;
      if (done && !stage.classList.contains("done")) finished();
      stage.classList.toggle("done", done);
    };
    const show = (i, offset) => {
      idx = (i + BLURTS.length) % BLURTS.length;
      const [to, ctx, messy, clean] = BLURTS[idx];
      d("to").textContent = to;
      d("ctx").textContent = ctx;
      d("messy").textContent = messy;
      d("clean").textContent = clean;
      d("messy").setAttribute("aria-hidden", "false");
      const date = new Date(EPOCH + (today + offset) * 864e5);
      d("no").innerHTML = offset === 0
        ? `No. ${String(today + 1).padStart(3, "0")}<br />${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : `From the archive<br />${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
      d("hint").innerHTML = touch ? "Tap the keys to unblur. <br />Or drag the line." : "Press it for real to unblur. <br />Or drag the line.";
      put(0);
    };
    let offset = 0;
    show(idx, 0);

    function finished() {
      d("hint").textContent = "unblurred. that's the whole trick.";
      d("messy").setAttribute("aria-hidden", "true");
      d("clean").setAttribute("aria-hidden", "false");
      const key = `ub-daily-${today}`;
      if (offset === 0 && !store.get(key)) {
        store.set(key, "1");
        countUnblur();
      }
    }

    const sweep = (to = 100, ms = 1100) => {
      cancelAnimationFrame(anim);
      if (reduced) { put(to); return; }
      stage.classList.add("anim");
      const from = p, t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        put(from + (to - from) * e);
        if (k < 1) anim = requestAnimationFrame(tick); else stage.classList.remove("anim");
      };
      anim = requestAnimationFrame(tick);
    };

    // drag anywhere on the card
    const fromEvent = (e) => {
      const r = stage.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * 100;
    };
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      cancelAnimationFrame(anim);
      stage.classList.add("drag");
      stage.setPointerCapture(e.pointerId);
      put(fromEvent(e));
    });
    stage.addEventListener("pointermove", (e) => { if (stage.classList.contains("drag")) put(fromEvent(e)); });
    const end = () => {
      if (!stage.classList.contains("drag")) return;
      stage.classList.remove("drag");
      if (p > 82) sweep(100, 260);
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    knob.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 20 : 5;
      const map = { ArrowRight: p + step, ArrowUp: p + step, ArrowLeft: p - step, ArrowDown: p - step, Home: 0, End: 100, PageUp: p + 25, PageDown: p - 25 };
      if (e.key in map) { e.preventDefault(); cancelAnimationFrame(anim); put(map[e.key]); }
    });

    // the real shortcut, and tapping the keycaps
    const keys = d("keys");
    const capEls = $$(".cap", keys);
    const press = (on) => capEls.forEach((c) => c.classList.toggle("down", on));
    const fire = () => { press(true); setTimeout(() => press(false), 160); sweep(p >= 99.5 ? 0 : 100); };
    keys.addEventListener("click", fire);
    keys.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });

    let inView = false;
    new IntersectionObserver(([en]) => { inView = en.isIntersecting; }, { threshold: 0.35 }).observe(stage);
    addEventListener("keydown", (e) => {
      if (!inView || e.repeat) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.code === "Space") { e.preventDefault(); fire(); }
    });

    d("next").addEventListener("click", () => {
      offset -= 1;
      show(idx - 1, offset);
      if (!reduced) {
        setTimeout(() => sweep(18, 500), 120);
        setTimeout(() => sweep(0, 420), 700);
      }
    });

    // first time it scrolls in: a small nudge so people see the line moves
    const nudge = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      nudge.disconnect();
      if (!reduced && p === 0) { setTimeout(() => sweep(22, 650), 350); setTimeout(() => p < 30 && sweep(0, 520), 1150); }
    }, { threshold: 0.6 });
    nudge.observe(stage);
  }

  // ---------------------------------------------------------------- ticker + wall
  const ticker = $("[data-ticker]");
  let weekCount = null;
  function setTicker(n) {
    weekCount = n;
    if (!ticker || n == null || n < 1) return;
    const t = $("[data-ticker-text]", ticker);
    t.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = fmt(n);
    t.append(b, ` ${n === 1 ? "message" : "messages"} unblurred on this site this week`);
    ticker.hidden = false;
  }
  // counts one unblur toward "this week" (Try it or blurt of the day); the server limits how often
  function countUnblur() {
    fetch("/api/stats?u=1").then((r) => r.json()).then((s) => s.week != null && setTicker(s.week)).catch(() => {});
  }
  if (ticker) fetch("/api/stats").then((r) => r.json()).then((s) => setTicker(s.week)).catch(() => {});

  const wall = $("[data-wall]");
  if (wall) {
    const MODE = { rephrase: "Rephrase", shorter: "Shorter", fix: "Fix" };
    fetch("/api/wall").then((r) => r.json()).then(({ items }) => {
      if (!items || items.length < 3) return;
      const grid = $("[data-wall-grid]", wall);
      grid.replaceChildren(...items.slice(0, 9).map((it) => {
        const a = document.createElement("article");
        a.className = "wall-card";
        const tag = document.createElement("span");
        tag.className = "mode-tag";
        tag.textContent = MODE[it.mode] || "Rephrase";
        const b = document.createElement("p");
        b.className = "before";
        b.textContent = it.before;
        const af = document.createElement("p");
        af.className = "after";
        af.textContent = it.after;
        a.append(tag, b, af);
        return a;
      }));
      wall.hidden = false;
      $$(".reveal", wall).forEach((r) => r.classList.add("in"));
    }).catch(() => {});
  }
})();
