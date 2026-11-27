/* Club Onyx — shared behaviour. Vanilla JS, no dependencies. */
(function () {
  "use strict";

  var cfg = window.ONYX_CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BADGE = {
    open: "badge badge--open",
    limited: "badge",
    soldout: "badge badge--closed",
    announced: "badge"
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DATA_URL = "assets/data/content.json";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function initials(name) {
    var words = String(name || "").replace(/[^\w\s'-]/g, "").split(/\s+/).filter(function (w) {
      return w && ["sir", "dame", "dj", "mc"].indexOf(w.toLowerCase()) === -1;
    });
    if (!words.length) return "ON";
    return words.slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("");
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Config-driven links ---------- */
  document.querySelectorAll("[data-link]").forEach(function (el) {
    var url = cfg.links && cfg.links[el.getAttribute("data-link")];
    if (!url) return;
    el.setAttribute("href", url);
    if (url === "#") {
      el.setAttribute("aria-disabled", "true");
      el.addEventListener("click", function (e) { e.preventDefault(); });
    } else {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });

  document.querySelectorAll("[data-mailto]").forEach(function (el) {
    if (!cfg.contactEmail) return;
    var subject = el.getAttribute("data-mailto-subject") || cfg.clubName || "Club Onyx";
    el.setAttribute("href", "mailto:" + cfg.contactEmail + "?subject=" + encodeURIComponent(subject));
    if (el.getAttribute("data-mailto") === "address") el.textContent = cfg.contactEmail;
  });

  /* ---------- Mobile navigation ---------- */
  var navToggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  function closeNav() {
    if (!navToggle || !nav) return;
    navToggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
    document.body.classList.remove("nav-open");
  }
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
      document.body.classList.toggle("nav-open", !open);
    });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) closeNav(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });
  }

  /* ---------- Header state ---------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 12); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Reveal on scroll ---------- */
  var io = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  }
  function reveal(root) {
    (root || document).querySelectorAll("[data-reveal]:not(.is-visible)").forEach(function (el) {
      if (io) io.observe(el);
      else el.classList.add("is-visible");
    });
  }
  reveal(document);

  /* ---------- Countdowns ---------- */
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateDigit(el) {
    if (reduceMotion || typeof el.animate !== "function") return;
    el.animate(
      [
        { opacity: 0.3, transform: "translateY(-0.16em)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 440, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }

  function tickCountdowns() {
    var now = Date.now();
    document.querySelectorAll("[data-countdown]").forEach(function (el) {
      var target = Date.parse(el.getAttribute("data-countdown"));
      if (isNaN(target)) return;
      var diff = target - now;
      var fields = el.querySelectorAll("[data-unit]");
      if (diff <= 0) {
        el.classList.add("is-live");
        fields.forEach(function (f) {
          f.textContent = f.getAttribute("data-unit") === "label" ? "Doors are open" : "00";
        });
        return;
      }
      var units = {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      };
      fields.forEach(function (f) {
        var unit = f.getAttribute("data-unit");
        if (units[unit] === undefined) return;
        var next = unit === "days" ? String(units[unit]) : pad(units[unit]);
        if (f.textContent === next) return;
        f.textContent = next;
        animateDigit(f);
      });
    });
  }
  tickCountdowns();
  (function scheduleCountdowns() {
    setTimeout(function () {
      tickCountdowns();
      scheduleCountdowns();
    }, 1000 - (Date.now() % 1000) + 8);
  })();

  /* ---------- Calendar ---------- */
  function byDate(a, b) { return Date.parse(a.date) - Date.parse(b.date); }
  function upcoming(events) {
    var cutoff = Date.now() - 6 * 3600 * 1000;
    return events.filter(function (e) { return Date.parse(e.date) >= cutoff; }).sort(byDate);
  }

  function nextEventHTML(ev, isEventsPage) {
    var badge = BADGE[ev.status] || "badge";
    return '' +
      '<div class="next-event">' +
      '<div class="next-event-grid">' +
        '<div>' +
          '<span class="' + badge + '">' + esc(ev.statusLabel || "Next up") + '</span>' +
          '<h2 style="margin-top:16px">' + esc(ev.title) + '</h2>' +
          '<div class="next-event-meta">' +
            '<span>' + esc(ev.displayDate) + '</span>' +
            '<span>' + esc(ev.time) + '</span>' +
            '<span>' + esc(ev.venue) + '</span>' +
            '<span>' + esc(ev.entry) + '</span>' +
          '</div>' +
          '<p class="lead" style="max-width:50ch">' + esc(ev.description) + '</p>' +
          '<div class="hero-actions" style="margin:26px 0 0">' +
            '<a class="btn btn--primary" href="reserve.html">Reserve a night</a>' +
            '<a class="btn btn--ghost" href="' + (isEventsPage ? "#calendar" : "events.html#calendar") + '">Full calendar</a>' +
          '</div>' +
        '</div>' +
        '<div class="countdown" data-countdown="' + esc(ev.date) + '" aria-label="Time until the next event">' +
          '<div><b data-unit="days">00</b><small>Days</small></div>' +
          '<div><b data-unit="hours">00</b><small>Hours</small></div>' +
          '<div><b data-unit="minutes">00</b><small>Mins</small></div>' +
          '<div><b data-unit="seconds">00</b><small>Secs</small></div>' +
        '</div>' +
      '</div>' +
      '</div>';
  }

  function eventCardHTML(ev) {
    var d = new Date(ev.date);
    var badge = BADGE[ev.status] || "badge";
    return '' +
      '<article class="event-card" data-event="' + esc((ev.tags || []).join(" ")) + '" data-reveal>' +
        '<div class="event-date">' +
          '<b>' + pad(d.getDate()) + '</b>' +
          '<small>' + MONTHS[d.getMonth()] + '</small>' +
          '<em>' + d.getFullYear() + '</em>' +
        '</div>' +
        '<div class="event-body">' +
          '<h3>' + esc(ev.title) + '</h3>' +
          '<p>' + esc(ev.description) + '</p>' +
          '<div class="event-info">' +
            '<span>' + esc(ev.time) + '</span>' +
            '<span>' + esc(ev.venue) + '</span>' +
            '<span>' + esc(ev.entry) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="event-cta">' +
          '<a class="btn btn--primary btn--small" href="reserve.html?night=' + encodeURIComponent(ev.title) + '">Reserve</a>' +
          '<span class="' + badge + '">' + esc(ev.statusLabel || "Open") + '</span>' +
        '</div>' +
      '</article>';
  }

  function renderCalendar(events) {
    var next = upcoming(events);
    var featured = next.filter(function (e) { return e.featured; })[0] || next[0];

    document.querySelectorAll("[data-next-event]").forEach(function (host) {
      host.innerHTML = featured
        ? nextEventHTML(featured, host.getAttribute("data-next-event") === "events")
        : '<div class="next-event"><div class="empty-state">The next season is being locked in. Join the list and you will hear first.</div></div>';
    });

    var list = document.querySelector("[data-events-list]");
    if (list) {
      list.innerHTML = next.map(eventCardHTML).join("");
      var empty = document.querySelector("[data-events-empty]");
      if (empty) empty.hidden = next.length !== 0;
      var blank = document.querySelector("[data-events-blank]");
      if (blank) blank.hidden = next.length !== 0;
      reveal(list);
    }

  }

  /* ---------- Team ---------- */
  function teamCardHTML(m) {
    var avatar = m.photo
      ? '<div class="avatar avatar--photo"><img src="' + esc(m.photo) + '" alt="" loading="lazy"></div>'
      : '<div class="avatar" aria-hidden="true">' + esc(initials(m.name)) + '</div>';
    var tags = (m.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join("");
    return '' +
      '<article class="team-card" data-reveal>' +
        avatar +
        '<h3>' + esc(m.name) + '</h3>' +
        '<span class="team-role">' + esc(m.role) + '</span>' +
        '<p>' + esc(m.bio) + '</p>' +
        (tags ? '<div class="team-tags">' + tags + '</div>' : '') +
      '</article>';
  }

  function renderTeam(team) {
    var preview = document.querySelector("[data-team-preview]");
    if (preview) {
      var picks = team.filter(function (m) { return m.featured; });
      if (!picks.length) picks = team;
      preview.innerHTML = picks.slice(0, 4).map(teamCardHTML).join("");
      reveal(preview);
    }

    var full = document.querySelector("[data-team-full]");
    if (!full) return;
    if (!team.length) {
      full.innerHTML = '<div class="empty-state">The roster is being updated. Check back soon.</div>';
      return;
    }

    var order = [];
    var groups = {};
    team.forEach(function (member) {
      var dept = member.dept || "Crew";
      if (!groups[dept]) { groups[dept] = []; order.push(dept); }
      groups[dept].push(member);
    });

    full.innerHTML = order.map(function (dept) {
      var members = groups[dept];
      return '' +
        '<div class="department" data-reveal>' +
          '<div class="department-head">' +
            '<h2>' + esc(dept) + '</h2>' +
            '<span>' + members.length + ' people</span>' +
          '</div>' +
          '<div class="team-grid">' + members.map(teamCardHTML).join("") + '</div>' +
        '</div>';
    }).join("");
    reveal(full);
  }

  /* ---------- Load content ---------- */
  function contentFailed() {
    document.querySelectorAll("[data-next-event]").forEach(function (host) {
      host.innerHTML = '<div class="next-event"><div class="empty-state">The calendar could not load. Open the site through the local server (npm run dev) or check assets/data/content.json.</div></div>';
    });
    var list = document.querySelector("[data-events-list]");
    if (list) list.innerHTML = '';
    var blank = document.querySelector("[data-events-blank]");
    if (blank) { blank.textContent = "The calendar could not load."; blank.hidden = false; }
    var team = document.querySelector("[data-team-full]");
    if (team) team.innerHTML = '<div class="empty-state">The roster could not load.</div>';
  }

  fetch(DATA_URL, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("Content unavailable");
      return res.json();
    })
    .then(function (data) {
      renderCalendar((data && data.events) || []);
      renderTeam((data && data.team) || []);
      fillReserveSelect((data && data.events) || []);
      tickCountdowns();
    })
    .catch(contentFailed);

  /* ---------- Event filters ---------- */
  var filterBar = document.querySelector("[data-filters]");
  if (filterBar) {
    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-filter]");
      if (!btn) return;
      var filter = btn.getAttribute("data-filter");
      filterBar.querySelectorAll("[data-filter]").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
      var cards = document.querySelectorAll("[data-event]");
      var shown = 0;
      cards.forEach(function (card) {
        var kinds = (card.getAttribute("data-event") || "").split(" ");
        var match = filter === "all" || kinds.indexOf(filter) !== -1;
        card.hidden = !match;
        if (match) shown++;
      });
      var empty = document.querySelector("[data-events-empty]");
      if (empty) {
        empty.hidden = shown !== 0;
        if (!shown) empty.textContent = "Nothing on that filter yet — try another category.";
      }
    });
  }

  /* ---------- Career role -> application form ---------- */
  document.querySelectorAll("[data-apply-role]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var select = document.querySelector("#role");
      if (select) {
        var role = btn.getAttribute("data-apply-role");
        var match = Array.prototype.find.call(select.options, function (o) { return o.value === role; });
        if (match) select.value = role;
      }
      var target = document.querySelector("#apply");
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  /* ---------- Forms ---------- */
  function setStatus(form, message, state) {
    var status = form.querySelector("[data-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || "info";
  }

  function validate(form) {
    var ok = true;
    form.querySelectorAll("[required]").forEach(function (field) {
      var valid = field.type === "checkbox" ? field.checked : field.checkValidity() && String(field.value).trim() !== "";
      field.classList.toggle("is-invalid", !valid);
      field.setAttribute("aria-invalid", String(!valid));
      if (!valid && ok) { ok = false; field.focus(); }
    });
    return ok;
  }

  function composeMailto(form) {
    var lines = [];
    form.querySelectorAll("input, select, textarea").forEach(function (field) {
      if (!field.name || field.type === "checkbox" || field.type === "submit" || field.type === "button") return;
      if (String(field.value).trim() === "") return;
      lines.push((field.getAttribute("data-label") || field.name) + ": " + field.value);
    });
    return "mailto:" + (cfg.contactEmail || "") +
      "?subject=" + encodeURIComponent(form.getAttribute("data-mailto-subject") || "Club Onyx enquiry") +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  document.querySelectorAll("[data-form]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var honeypot = form.querySelector('[name="company"]');
      if (honeypot && honeypot.value) return;
      if (!validate(form)) {
        setStatus(form, "Almost — a couple of fields still need filling in.", "error");
        return;
      }

      var submit = form.querySelector('[type="submit"]');
      var label = submit ? submit.textContent : "";
      if (submit) { submit.disabled = true; submit.textContent = "Sending…"; }
      setStatus(form, "", "info");

      var done = function (message) {
        form.reset();
        form.querySelectorAll(".is-invalid").forEach(function (f) { f.classList.remove("is-invalid"); });
        setStatus(form, message, "success");
        if (submit) { submit.disabled = false; submit.textContent = label; }
      };
      var fail = function (message) {
        setStatus(form, message, "error");
        if (submit) { submit.disabled = false; submit.textContent = label; }
      };

      if (!cfg.formEndpoint) {
        window.location.href = composeMailto(form);
        done("Your mail app should be open with everything filled in. If not, DM us on Discord.");
        return;
      }

      var payload = new FormData(form);
      payload.append("_page", window.location.href);
      fetch(cfg.formEndpoint, { method: "POST", body: payload, headers: { Accept: "application/json" } })
        .then(function (res) { if (!res.ok) throw new Error("failed"); done("Sent — the team will get back to you on Discord."); })
        .catch(function () { fail("That didn't send. Try again, or DM us on Discord."); });
    });

    form.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.addEventListener("input", function () {
        if (field.classList.contains("is-invalid") && field.checkValidity()) {
          field.classList.remove("is-invalid");
          field.removeAttribute("aria-invalid");
        }
      });
    });
  });

  /* ---------- Reservations ---------- */
  var reserveForm = document.querySelector("[data-reserve-form]");
  var reservePrices = null;

  function money(value) {
    var sign = (reservePrices && reservePrices.currency) || "$";
    return sign + Number(value || 0).toLocaleString("en-GB");
  }

  function reserveAmount() {
    if (!reserveForm || !reservePrices) return 0;
    var type = reserveForm.querySelector('[name="type"]').value;
    var party = parseInt(reserveForm.querySelector('[name="party"]').value, 10) || 0;
    if (type === "Table") return reservePrices.table;
    if (type === "Booth") return reservePrices.booth;
    return reservePrices.guest * Math.max(party, 0);
  }

  function updateReserveSummary() {
    if (!reserveForm) return;
    var total = reserveForm.querySelector("[data-price-total]");
    var label = reserveForm.querySelector("[data-confirm-label]");
    var amount = reserveAmount();
    if (total) total.textContent = reservePrices ? money(amount) : "—";
    if (label) {
      label.textContent = reservePrices && amount > 0
        ? "I understand " + money(amount) + " is paid at the door."
        : "I understand the amount is paid at the door.";
    }
  }

  function fillReserveSelect(events) {
    var select = document.querySelector("[data-night-select]");
    if (!select) return;
    var list = upcoming(events);
    if (!list.length) {
      select.innerHTML = '<option value="">No nights on sale right now</option>';
      return;
    }
    select.innerHTML = '<option value="">Pick a night</option>' + list.map(function (ev) {
      var value = ev.title + " — " + ev.displayDate;
      return '<option value="' + esc(value) + '">' + esc(value) + '</option>';
    }).join("");

    var wanted = new URLSearchParams(window.location.search).get("night");
    if (!wanted) return;
    var match = Array.prototype.find.call(select.options, function (o) {
      return o.value.toLowerCase().indexOf(wanted.toLowerCase()) === 0;
    });
    if (match) select.value = match.value;
  }

  if (reserveForm) {
    fetch("/api/reserve", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.prices) return;
        reservePrices = data.prices;
        var guest = reserveForm.querySelector("[data-price-guest]");
        var table = reserveForm.querySelector("[data-price-table]");
        var booth = reserveForm.querySelector("[data-price-booth]");
        if (guest) guest.textContent = money(reservePrices.guest) + " per person";
        if (table) table.textContent = money(reservePrices.table);
        if (booth) booth.textContent = money(reservePrices.booth);
        updateReserveSummary();
      })
      .catch(function () {
        var hint = reserveForm.querySelector("[data-price-hint]");
        if (hint) hint.textContent = "Prices could not load. The team will confirm the amount with you at the door.";
      });

    reserveForm.addEventListener("input", updateReserveSummary);
    reserveForm.addEventListener("change", updateReserveSummary);
    updateReserveSummary();

    reserveForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var honeypot = reserveForm.querySelector('[name="company"]');
      if (honeypot && honeypot.value) return;
      if (!validate(reserveForm)) {
        setStatus(reserveForm, "Almost — check the fields marked in red.", "error");
        return;
      }

      var submit = reserveForm.querySelector('[type="submit"]');
      var label = submit ? submit.textContent : "";
      if (submit) { submit.disabled = true; submit.textContent = "Reserving…"; }
      setStatus(reserveForm, "", "info");

      var payload = {
        night: reserveForm.querySelector('[name="night"]').value,
        name: reserveForm.querySelector('[name="name"]').value.trim(),
        contact: reserveForm.querySelector('[name="contact"]').value.trim(),
        party: parseInt(reserveForm.querySelector('[name="party"]').value, 10) || 0,
        type: reserveForm.querySelector('[name="type"]').value,
        notes: reserveForm.querySelector('[name="notes"]').value.trim(),
        confirm: true,
        company: ""
      };

      fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (result) {
          if (!result.ok) throw new Error((result.data && result.data.error) || "Reservation failed");
          var amount = result.data && typeof result.data.amount === "number" ? result.data.amount : reserveAmount();
          var id = (result.data && result.data.id) || "";
          reserveForm.reset();
          reserveForm.querySelectorAll(".is-invalid").forEach(function (f) { f.classList.remove("is-invalid"); });
          updateReserveSummary();
          setStatus(reserveForm, "Reserved" + (id ? " — reference " + id : "") + ". " + money(amount) + " is due at the door.", "success");
        })
        .catch(function (err) {
          setStatus(reserveForm, err.message || "That did not send. Try again or message us on Discord.", "error");
        })
        .finally(function () {
          if (submit) { submit.disabled = false; submit.textContent = label; }
        });
    });
  }
})();
