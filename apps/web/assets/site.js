(() => {
  const ua = navigator.userAgent;
  // Phones and tablets can't run the desktop app. iPadOS reports itself as a Mac, so check touch too.
  const mobile = /iPhone|iPad|iPod|Android/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0);
  const os = mobile ? null : /Mac/.test(ua) ? "mac" : /Win/.test(ua) ? "windows" : /Linux|X11/.test(ua) ? "linux" : null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const OS_NAMES = { mac: "Mac", windows: "Windows", linux: "Linux" };

  // ---------- platform-aware copy ----------
  if (os && os !== "mac") document.querySelectorAll("[data-mod]").forEach((el) => (el.textContent = "Ctrl"));
  if (os) {
    document.querySelectorAll("[data-os-cta]").forEach((el) => (el.textContent = `Download for ${OS_NAMES[os]}`));
    document.querySelector(`.platform[data-os="${os}"]`)?.classList.add("mine");
  }

  // ---------- download links: the matching file in the latest GitHub Release ----------
  const assetLinks = document.querySelectorAll("a[data-asset]");
  if (assetLinks.length) {
    fetch("https://api.github.com/repos/Viral-Sachde/unblurt/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((rel) => {
        assetLinks.forEach((a) => {
          const re = new RegExp(a.dataset.asset);
          const file = (rel.assets || []).find((f) => re.test(f.name));
          if (file) a.href = file.browser_download_url;
        });
        document.querySelectorAll("[data-release-version]").forEach((el) => (el.textContent = rel.tag_name.replace(/^v/, "")));
      })
      .catch(() => {}); // links already point at the release page
  }

  // ---------- footer counters: visitors (counted once per browser session) and total downloads ----------
  const statEls = document.querySelectorAll("[data-stats]");
  if (statEls.length) {
    let first = false;
    try { first = !sessionStorage.getItem("ub-seen"); sessionStorage.setItem("ub-seen", "1"); } catch {}
    fetch(`/api/stats${first ? "?hit=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ visitors, downloads }) => {
        const n = (v) => Number(v).toLocaleString("en-US");
        const parts = [];
        if (visitors != null) parts.push(`${n(visitors)} ${visitors === 1 ? "visitor" : "visitors"}`);
        if (downloads != null) parts.push(`${n(downloads)} ${downloads === 1 ? "download" : "downloads"}`);
        if (!parts.length) return;
        statEls.forEach((el) => { el.textContent = parts.join(" · "); el.hidden = false; });
      })
      .catch(() => {}); // counters just stay hidden
  }

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
    { threshold: 0.12 },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // ---------- progressive blur along the bottom edge (hidden once you reach the end) ----------
  const edge = document.createElement("div");
  edge.className = "edge-blur";
  edge.setAttribute("aria-hidden", "true");
  edge.innerHTML = "<i></i><i></i><i></i><i></i><i></i>";
  document.body.append(edge);
  const edgeCheck = () => {
    const end = document.documentElement.scrollHeight - innerHeight - 8;
    edge.classList.toggle("off", scrollY >= end);
  };
  addEventListener("scroll", edgeCheck, { passive: true });
  addEventListener("resize", edgeCheck);
  edgeCheck();

  // ---------- hero keycaps: press on tap, and mirror the real keyboard ----------
  const capsRow = document.querySelector(".keycaps");
  if (capsRow) {
    const cap = (k) => capsRow.querySelector(`[data-cap="${k}"]`);
    const set = (k, on) => cap(k)?.classList.toggle("down", on);
    const keyOf = (e) => (e.key === "Meta" || e.key === "Control" ? "mod" : e.key === "Shift" ? "shift" : e.key === " " ? "space" : null);
    addEventListener("keydown", (e) => { const k = keyOf(e); if (k) set(k, true); });
    addEventListener("keyup", (e) => { const k = keyOf(e); if (k) set(k, false); });
    addEventListener("blur", () => ["mod", "shift", "space"].forEach((k) => set(k, false)));
    capsRow.querySelectorAll(".cap").forEach((c) => {
      c.addEventListener("pointerdown", () => c.classList.add("down"));
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => c.addEventListener(ev, () => c.classList.remove("down")));
    });
    if (!reduced) {
      // play the shortcut once, shortly after load
      const seq = [["mod", 900, true], ["shift", 1060, true], ["space", 1220, true], ["space", 1520, false], ["shift", 1580, false], ["mod", 1640, false]];
      seq.forEach(([k, ms, on]) => setTimeout(() => set(k, on), ms));
    }
  }

  // ---------- hero plate scene: clicking it plays the plate demo further down ----------
  document.querySelectorAll("[data-plate-demo]").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("how")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      document.querySelector('[data-scene="3"]')?.click();
    }),
  );

  // ---------- story: the old copy/paste dance, played by scrolling ----------
  const track = document.getElementById("story-track");
  if (track) {
    const vis = document.getElementById("story-vis");
    const stage = track.querySelector(".story-stage");
    const words = track.querySelector(".story-words");
    const wordEls = [...words.querySelectorAll("[data-w]")];
    const caps = [...track.querySelectorAll("[data-c]")];
    const chip = document.getElementById("sv-key");
    const pointer = document.getElementById("sv-cursor");
    const mod = os && os !== "mac" ? "Ctrl" : "⌘";
    const capHTML = (keys) =>
      keys.map((k) => `<span class="cap ${k === mod ? "t" : k === "⇧" ? "o" : k === "space" ? "sp" : ""}">${k}</span>`).join("");
    const CHIPS = { 1: [mod, "C"], 2: [mod, "V"], 4: [mod, "C"], 5: [mod, "V"], 6: [mod, "⇧", "space"] };
    const APP = ["slack", "slack", "chat", "chat", "chat", "slack", "slack"];
    const q = (sel) => vis.querySelector(sel);
    // where the pointer rests in each beat: [element, x fraction, y fraction] or "end" of a text run
    const TARGET = {
      0: [".sv-composer", 0.82, 0.75],
      1: [".sv-messy .sv-t", "end"],
      2: [".sv-input", 0.62, 0.78],
      3: [".sv-send", 0.5, 0.5],
      4: [".sv-answer .sv-t", "end"],
      5: [".sv-composer", 0.82, 0.62],
    };
    const place = (b) => {
      const tgt = TARGET[b];
      if (!tgt) return;
      const box = vis.getBoundingClientRect();
      const node = q(tgt[0]);
      let x, y;
      if (tgt[1] === "end") {
        const rects = node.getClientRects();
        const r = rects[rects.length - 1];
        x = r.right - box.left;
        y = r.bottom - box.top - 4;
      } else {
        const r = node.getBoundingClientRect();
        x = r.left - box.left + r.width * tgt[1];
        y = r.top - box.top + r.height * tgt[2];
      }
      pointer.style.setProperty("--x", `${x}px`);
      pointer.style.setProperty("--y", `${y}px`);
    };

    let beat = -1;
    const apply = (b) => {
      if (b === beat) return;
      beat = b;
      vis.dataset.beat = String(b);
      // the hint leaves when the first keys appear (beat 1), so the two never overlap
      track.classList.toggle("started", b >= 1);
      vis.dataset.app = APP[b];
      wordEls.forEach((w) => {
        const i = Number(w.dataset.w);
        w.classList.toggle("on", b < 6 && i < b);
        w.classList.toggle("now", b < 6 && i === b);
      });
      words.classList.toggle("struck", b === 6);
      caps.forEach((c) => c.classList.toggle("on", Number(c.dataset.c) === b));
      if (CHIPS[b]) {
        chip.innerHTML = capHTML(CHIPS[b]);
        chip.classList.add("show");
        chip.classList.remove("tap");
        void chip.offsetWidth;
        chip.classList.add("tap");
      } else chip.classList.remove("show");
      requestAnimationFrame(() => place(b));
    };

    // How long each beat lasts, in screens of scrolling. The opening beat is longer: it's where
    // the scroll hint shows, and a small scroll shouldn't end it. Must add up to the 7.8 in site.css.
    const BEATS = [1.8, 1, 1, 1, 1, 1, 1];
    const TOTAL = BEATS.reduce((a, b) => a + b, 0);
    const beatAt = (p) => {
      let edge = 0;
      for (let i = 0; i < BEATS.length; i++) {
        edge += BEATS[i] / TOTAL;
        if (p < edge) return i;
      }
      return BEATS.length - 1;
    };

    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const r = track.getBoundingClientRect();
      const run = r.height - stage.offsetHeight;
      const p = Math.min(1, Math.max(0, -r.top / run));
      // the hint rises once the scene has locked into place
      track.classList.toggle("near", r.top <= 70 && r.bottom > innerHeight);
      apply(beatAt(p));
    };
    addEventListener("scroll", () => ticking || ((ticking = true), requestAnimationFrame(onScroll)), { passive: true });
    addEventListener("resize", () => place(beat));
    onScroll();
  }

  // ---------- copy buttons ----------
  document.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "copied";
      } catch {
        btn.textContent = "select it ↖";
      }
      setTimeout(() => (btn.textContent = "copy"), 1400);
    }),
  );

  // ---------- live demo ----------
  const demo = document.getElementById("demo");
  if (demo) {
    const $ = (k) => demo.querySelector(`[data-demo="${k}"]`);
    const el = {
      where: $("where"), thread: $("thread"), composer: $("composer"), keys: $("keys"), pop: $("pop"),
      tone: $("tone"), modes: $("modes"), input: $("input"), note: $("note"), output: $("output"), go: $("go"),
      cursor: $("cursor"), app: demo.querySelector(".fake-app"), plate: $("plate"), ghost: $("ghost"),
    };
    const tabs = [...demo.querySelectorAll("[data-scene]")];

    const SCENES = [
      {
        where: "#launch-crew",
        thread: [{ who: "Dana", text: "standup moved to 9:30 tomorrow fyi" }],
        messy: "ok so i cant do tmrw standup bc dentist :( can someone pls cover the release notes thing, ill catch up after lunch",
        mode: "Message", tone: "casual", note: "",
        result: "Heads up: I can't make standup tomorrow (dentist). Could someone cover the release notes? I'll catch up after lunch.",
      },
      {
        where: "New message",
        thread: [],
        messy: "need to push the design review to next week, designs not ready, sorry. thurs or fri? ask what works for them",
        mode: "Email", tone: "neutral", note: "it's for the client",
        result:
          "Subject: Moving our design review to next week\n\nHi [name],\n\nWe need a little more time to get the designs where we want them, so I'd like to move our review to next week. Would Thursday or Friday work for you?\n\nThanks for your patience,",
      },
      {
        where: "Sam",
        thread: [{ who: "Sam", text: "Hey! Any chance you could send the Q3 numbers before Friday's board prep?" }],
        selectThread: true,
        messy: "Hey! Any chance you could send the Q3 numbers before Friday's board prep?",
        mode: "Reply", tone: "warm", note: "yes but only thursday evening",
        result: "Happy to! I'll have the Q3 numbers over to you Thursday evening, so they're ready in time for Friday's prep.",
      },
      {
        where: "Q3 update",
        thread: [],
        messy: "so basically what im trying to say is the billing timeline doesnt really work and we need like more time to do it properly",
        mode: "Rephrase", tone: "neutral", note: "",
        plate: true,
        result: "The billing timeline doesn't work for us as it stands. We need more time to do it properly.",
      },
    ];

    let token = { stop: false };
    const wait = (ms, t) =>
      new Promise((res, rej) => setTimeout(() => (t.stop ? rej(new Error("stopped")) : res()), ms));
    const type = async (node, text, t, speed = 22) => {
      if (reduced) return void (node.textContent = text);
      node.textContent = "";
      for (let i = 0; i < text.length; i += 2) {
        node.textContent = text.slice(0, i + 2);
        await wait(speed, t);
      }
    };
    // ---- the pointer: moves between real elements, drags to select, clicks ----
    const at = (node, fx = 0.5, fy = 0.5) => {
      const r = node.getBoundingClientRect();
      const d = demo.getBoundingClientRect();
      return [r.left - d.left + r.width * fx, r.top - d.top + r.height * fy];
    };
    const moveTo = async ([x, y], ms, t) => {
      el.cursor.classList.add("on");
      el.cursor.style.setProperty("--dur", `${reduced ? 0 : ms}ms`);
      el.cursor.style.setProperty("--x", `${x}px`);
      el.cursor.style.setProperty("--y", `${y}px`);
      await wait(reduced ? 0 : ms, t);
    };
    const click = async (t) => {
      el.cursor.classList.add("click");
      await wait(130, t);
      el.cursor.classList.remove("click");
    };
    const rest = () => at(el.app, 0.86, 0.62);
    // Drag across `text` inside `host`, growing a highlighted selection under the pointer.
    const dragSelect = async (host, text, t) => {
      host.innerHTML = '<span class="sel"></span><span class="mk"></span><span class="rest"></span>';
      const [sel, mk, restEl] = host.children;
      restEl.textContent = text;
      const point = () => at(mk, 0, 0.85);
      el.cursor.classList.add("text");
      await moveTo(point(), 650, t);
      await wait(180, t);
      const step = Math.max(2, Math.round(text.length / 36));
      for (let n = 0; n <= text.length; n += step) {
        sel.textContent = text.slice(0, n);
        restEl.textContent = text.slice(n);
        await moveTo(point(), 16, t);
      }
      sel.textContent = text;
      restEl.textContent = "";
      await moveTo(point(), 16, t);
      await wait(250, t);
      el.cursor.classList.remove("text");
      host.innerHTML = "";
      host.append(sel);
      return sel;
    };

    const press = async (node, t) => {
      node.classList.add("press");
      await wait(140, t);
      node.classList.remove("press");
    };

    const reset = (s) => {
      el.where.textContent = s.where;
      el.thread.innerHTML = "";
      for (const m of s.thread) {
        const b = document.createElement("div");
        b.className = "bubble them";
        b.innerHTML = "<small></small><span></span>";
        b.querySelector("small").textContent = m.who;
        b.querySelector("span").textContent = m.text;
        el.thread.append(b);
      }
      el.composer.className = "composer";
      demo.classList.toggle("with-plate", !!s.plate);
      el.plate.className = "fake-plate";
      el.ghost.classList.remove("show");
      el.composer.innerHTML = '<span class="caret"></span>';
      el.pop.className = "pop";
      el.go.textContent = "unblurt ↵";
      el.note.textContent = "";
      el.output.textContent = "";
      [...el.modes.children].forEach((c) => c.classList.toggle("on", c.textContent === s.mode));
      el.tone.textContent = s.tone;
    };

    const play = async (s, t) => {
      reset(s);
      await wait(500, t);
      if (s.selectThread) {
        const host = el.thread.lastElementChild.querySelector("span");
        await dragSelect(host, s.messy, t);
      } else {
        await moveTo(rest(), 500, t);
        const span = document.createElement("span");
        el.composer.prepend(span);
        await type(span, s.messy, t, 18);
        await wait(400, t);
        const host = document.createElement("span");
        el.composer.innerHTML = "";
        el.composer.append(host);
        await dragSelect(host, s.messy, t);
      }
      if (s.plate) {
        // grab the selection and drag it onto the plate at the screen edge
        const sel = (s.selectThread ? el.thread : el.composer).querySelector(".sel");
        await moveTo(at(sel, 0.35, 0.5), 450, t);
        await wait(200, t);
        el.ghost.textContent = s.messy.length > 34 ? `${s.messy.slice(0, 34).trim()}…` : s.messy;
        el.ghost.classList.add("show");
        const [px, py] = at(el.plate, 0.5, 0.5);
        await moveTo([px + 120, py], 900, t);
        el.plate.classList.add("drag");
        await wait(250, t);
        await moveTo(at(el.plate, 0.62, 0.5), 450, t);
        await wait(450, t);
        el.ghost.classList.remove("show");
        el.plate.classList.replace("drag", "got");
        await wait(550, t);
        el.plate.classList.remove("got");
      } else {
        await wait(500, t);
        el.keys.classList.add("show");
        await wait(300, t);
        await press(el.keys, t);
        await wait(250, t);
        el.keys.classList.remove("show");
      }

      el.input.textContent = s.messy;
      el.pop.classList.add("show");
      await wait(800, t);
      if (s.note) await type(el.note, s.note, t, 40);
      await moveTo(at(el.go, 0.55, 0.6), 650, t);
      await wait(150, t);
      await Promise.all([click(t), press(el.go, t)]);
      el.pop.classList.add("working");
      await wait(1500, t);
      el.pop.classList.remove("working");
      el.pop.classList.add("result");
      el.go.textContent = "paste ↵";
      await type(el.output, s.result, t, 8);
      await moveTo(at(el.go, 0.55, 0.6), 400, t);
      await wait(900, t);
      await Promise.all([click(t), press(el.go, t)]);
      el.pop.classList.remove("show");
      el.thread.querySelector(".sel")?.classList.remove("sel");
      el.composer.textContent = s.result;
      el.composer.classList.add("done");
      await moveTo(rest(), 700, t);
      await wait(2200, t);
    };

    const run = async (start) => {
      token.stop = true;
      const t = (token = { stop: false });
      let i = start;
      try {
        for (;;) {
          tabs.forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
          await play(SCENES[i], t);
          i = (i + 1) % SCENES.length;
          // the pointer walks up and clicks the next example
          await moveTo(at(tabs[i], 0.5, 0.55), 800, t);
          await click(t);
        }
      } catch {
        /* a newer run took over */
      }
    };


    const startObs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        startObs.disconnect();
        run(0);
      }
    }, { threshold: 0.3 });
    tabs.forEach((b) =>
      b.addEventListener("click", () => {
        // a chosen tab wins over the "start when visible" kick-off
        startObs.disconnect();
        run(Number(b.dataset.scene));
      }),
    );
    reset(SCENES[0]);
    startObs.observe(demo);
  }

  // ---------- showreel ----------
  const reel = document.getElementById("reel");
  if (reel) {
    const cards = [...reel.querySelectorAll(".reel-card")];
    const dots = document.getElementById("reel-dots");
    const n = cards.length;
    let active = 0;
    let timer = null;

    cards.forEach(() => dots.append(document.createElement("i")));

    const layout = () => {
      cards.forEach((c, i) => {
        let k = i - active;
        if (k > n / 2) k -= n;
        if (k < -n / 2) k += n;
        const a = Math.abs(k);
        c.style.transform = `translateX(${k * 60}%) translateZ(${-a * 240}px) rotateY(${-k * 32}deg)`;
        c.style.opacity = a > 2 ? "0" : "1";
        c.style.zIndex = String(10 - a);
        c.style.filter = a ? `brightness(${1 - a * 0.2})` : "none";
        c.setAttribute("aria-hidden", String(a !== 0));
      });
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i === active));
    };
    const go = (i) => {
      active = (i + n) % n;
      layout();
    };
    const play = () => {
      if (reduced) return;
      clearInterval(timer);
      timer = setInterval(() => go(active + 1), 3600);
    };
    const pause = () => clearInterval(timer);

    cards.forEach((c, i) => c.addEventListener("click", () => go(i)));
    document.querySelector('[data-reel="prev"]').addEventListener("click", () => (go(active - 1), play()));
    document.querySelector('[data-reel="next"]').addEventListener("click", () => (go(active + 1), play()));
    reel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(active - 1);
      if (e.key === "ArrowRight") go(active + 1);
    });
    reel.addEventListener("mouseenter", pause);
    reel.addEventListener("mouseleave", play);

    let startX = null;
    reel.addEventListener("pointerdown", (e) => (startX = e.clientX));
    reel.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1)), play();
    });

    layout();
    play();
  }
})();
