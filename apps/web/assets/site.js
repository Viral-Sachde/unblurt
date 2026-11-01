(() => {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "mac" : /Win/.test(ua) ? "windows" : /Linux|X11/.test(ua) ? "linux" : null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const OS_NAMES = { mac: "Mac", windows: "Windows", linux: "Linux" };

  // ---------- platform-aware copy ----------
  if (os && os !== "mac") document.querySelectorAll("[data-mod]").forEach((el) => (el.textContent = "Ctrl"));
  if (os) {
    document.querySelectorAll("[data-os-cta]").forEach((el) => (el.textContent = `Download for ${OS_NAMES[os]}`));
    document.querySelector(`.platform[data-os="${os}"]`)?.classList.add("mine");
  }

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
    { threshold: 0.12 },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

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
      await wait(600, t);
      if (s.selectThread) {
        el.thread.lastElementChild.querySelector("span").classList.add("sel");
      } else {
        const span = document.createElement("span");
        el.composer.prepend(span);
        await type(span, s.messy, t, 18);
        await wait(500, t);
        el.composer.innerHTML = "";
        const sel = document.createElement("span");
        sel.className = "sel";
        sel.textContent = s.messy;
        el.composer.append(sel);
      }
      await wait(500, t);
      el.keys.classList.add("show");
      await wait(300, t);
      await press(el.keys, t);
      await wait(250, t);
      el.keys.classList.remove("show");

      el.input.textContent = s.messy;
      el.pop.classList.add("show");
      await wait(800, t);
      if (s.note) await type(el.note, s.note, t, 40);
      await wait(450, t);
      await press(el.go, t);
      el.pop.classList.add("working");
      await wait(1500, t);
      el.pop.classList.remove("working");
      el.pop.classList.add("result");
      el.go.textContent = "paste ↵";
      await type(el.output, s.result, t, 8);
      await wait(1400, t);
      await press(el.go, t);
      el.pop.classList.remove("show");
      el.thread.querySelector(".sel")?.classList.remove("sel");
      el.composer.textContent = s.result;
      el.composer.classList.add("done");
      await wait(3200, t);
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
        }
      } catch {
        /* a newer run took over */
      }
    };

    tabs.forEach((b) => b.addEventListener("click", () => run(Number(b.dataset.scene))));
    const startObs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        startObs.disconnect();
        run(0);
      }
    }, { threshold: 0.3 });
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
