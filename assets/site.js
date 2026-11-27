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
            '<a class="btn btn--primary" href="tickets.html">Buy tickets</a>' +
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
          '<a class="btn btn--primary btn--small" href="tickets.html?night=' + encodeURIComponent(ev.id) + '">Buy tickets</a>' +
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
      fillTicketNights((data && data.events) || []);
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

  /* ---------- Tickets ---------- */
  var ticketForm = document.querySelector("[data-ticket-form]");
  var ticketNights = [];

  function money(value) {
    return "$" + Number(value || 0).toLocaleString("en-GB");
  }

  function nightById(id) {
    return ticketNights.filter(function (ev) { return ev.id === id; })[0] || null;
  }

  function ticketTotal() {
    if (!ticketForm) return 0;
    var ev = nightById(ticketForm.querySelector('[name="eventId"]').value);
    if (!ev) return 0;
    var qty = parseInt(ticketForm.querySelector('[name="qty"]').value, 10) || 0;
    return (Number(ev.ticket) || 0) * Math.max(qty, 0);
  }

  function updateTicketSummary() {
    if (!ticketForm) return;
    var ev = nightById(ticketForm.querySelector('[name="eventId"]').value);
    var each = ticketForm.querySelector("[data-ticket-each]");
    var total = ticketForm.querySelector("[data-ticket-total]");
    var label = ticketForm.querySelector("[data-ticket-confirm]");
    var amount = ticketTotal();
    if (each) each.textContent = !ev ? "—" : (Number(ev.ticket) > 0 ? money(ev.ticket) + " each" : "Free entry");
    if (total) total.textContent = ev ? money(amount) : "—";
    if (label) {
      label.textContent = ev && amount > 0
        ? "I understand " + money(amount) + " is paid at the door."
        : "I understand the order is paid at the door.";
    }
  }

  function fillTicketNights(events) {
    ticketNights = upcoming(events);
    var list = document.querySelector("[data-nights-list]");
    var select = document.querySelector("[data-night-select]");

    if (select) {
      select.innerHTML = ticketNights.length
        ? '<option value="">Pick a night</option>' + ticketNights.map(function (ev) {
            return '<option value="' + esc(ev.id) + '">' + esc(ev.title + " — " + ev.displayDate) + '</option>';
          }).join("")
        : '<option value="">No nights on sale right now</option>';
    }

    if (list) {
      list.innerHTML = ticketNights.length ? ticketNights.map(function (ev) {
        var d = new Date(ev.date);
        var price = Number(ev.ticket) || 0;
        return '' +
          '<article class="event-card" data-reveal>' +
            '<div class="event-date">' +
              '<b>' + pad(d.getDate()) + '</b><small>' + MONTHS[d.getMonth()] + '</small><em>' + d.getFullYear() + '</em>' +
            '</div>' +
            '<div class="event-body">' +
              '<h3>' + esc(ev.title) + '</h3>' +
              '<p>' + esc(ev.description) + '</p>' +
              '<div class="event-info">' +
                '<span>' + esc(ev.time) + '</span>' +
                '<span>' + esc(ev.venue) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="event-cta">' +
              '<span class="badge' + (price > 0 ? "" : " badge--open") + '">' + (price > 0 ? money(price) + ' per ticket' : "Free entry") + '</span>' +
              '<button class="btn btn--primary btn--small" type="button" data-buy="' + esc(ev.id) + '">Buy tickets</button>' +
            '</div>' +
          '</article>';
      }).join("") : '<div class="empty-state">Nothing on sale right now. The next season is being locked in.</div>';
      reveal(list);
    }

    var wanted = new URLSearchParams(window.location.search).get("night");
    if (wanted && select) {
      var match = ticketNights.filter(function (ev) {
        return ev.id === wanted || ev.title.toLowerCase() === wanted.toLowerCase();
      })[0];
      if (match) select.value = match.id;
    }
    updateTicketSummary();
  }

  if (ticketForm) {
    ticketForm.addEventListener("input", updateTicketSummary);
    ticketForm.addEventListener("change", updateTicketSummary);
    updateTicketSummary();

    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-buy]");
      if (!btn) return;
      var select = ticketForm.querySelector('[name="eventId"]');
      if (select) select.value = btn.getAttribute("data-buy");
      updateTicketSummary();
      var target = document.querySelector("#checkout");
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      var qty = ticketForm.querySelector('[name="qty"]');
      if (qty) window.setTimeout(function () { qty.focus({ preventScroll: true }); }, reduceMotion ? 0 : 480);
    });

    ticketForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var honeypot = ticketForm.querySelector('[name="company"]');
      if (honeypot && honeypot.value) return;
      if (!validate(ticketForm)) {
        setStatus(ticketForm, "Almost — check the fields marked in red.", "error");
        return;
      }

      var submit = ticketForm.querySelector('[type="submit"]');
      var label = submit ? submit.textContent : "";
      if (submit) { submit.disabled = true; submit.textContent = "Placing order…"; }
      setStatus(ticketForm, "", "info");

      var payload = {
        eventId: ticketForm.querySelector('[name="eventId"]').value,
        qty: parseInt(ticketForm.querySelector('[name="qty"]').value, 10) || 0,
        icName: ticketForm.querySelector('[name="icName"]').value.trim(),
        roblox: ticketForm.querySelector('[name="roblox"]').value.trim(),
        notes: ticketForm.querySelector('[name="notes"]').value.trim(),
        confirm: true,
        company: ""
      };

      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (result) {
          if (!result.ok) throw new Error((result.data && result.data.error) || "Order failed");
          var total = result.data && typeof result.data.total === "number" ? result.data.total : ticketTotal();
          var id = (result.data && result.data.id) || "";
          ticketForm.reset();
          ticketForm.querySelectorAll(".is-invalid").forEach(function (f) { f.classList.remove("is-invalid"); });
          updateTicketSummary();
          setStatus(ticketForm, "Order placed" + (id ? " — reference " + id : "") + ". " + money(total) + " is paid at the door.", "success");
        })
        .catch(function (err) {
          setStatus(ticketForm, err.message || "That did not send. Try again or message us on Discord.", "error");
        })
        .finally(function () {
          if (submit) { submit.disabled = false; submit.textContent = label; }
        });
    });
  }
})();
