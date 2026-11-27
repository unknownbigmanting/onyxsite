/* Club Onyx — staff editor. Sessions are issued and verified by /api. */
(function () {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var login = document.getElementById("login");
  var editor = document.getElementById("editor");
  var loginForm = document.querySelector("[data-login]");
  var loginStatus = document.querySelector("[data-login-status]");
  var setup = document.getElementById("setup");
  var setupForm = document.querySelector("[data-setup]");
  var setupStatus = document.querySelector("[data-setup-status]");
  var saveState = document.querySelector("[data-save-state]");
  var logEl = document.querySelector("[data-admin-log]");

  var eventList = document.querySelector("[data-events-list]");
  var eventEmpty = document.querySelector("[data-events-empty]");
  var eventCount = document.querySelector("[data-count-label]");
  var eventForm = document.querySelector("[data-event-form]");
  var eventFormTitle = document.querySelector("[data-event-form-title]");
  var eventSubmit = document.querySelector("[data-event-submit]");

  var teamList = document.querySelector("[data-team-list]");
  var teamEmpty = document.querySelector("[data-team-empty]");
  var teamCount = document.querySelector("[data-team-count]");
  var memberForm = document.querySelector("[data-member-form]");
  var memberFormTitle = document.querySelector("[data-member-form-title]");
  var memberSubmit = document.querySelector("[data-member-submit]");

  var orderList = document.querySelector("[data-order-list]");
  var orderEmpty = document.querySelector("[data-order-empty]");
  var orderCount = document.querySelector("[data-order-count]");
  var orderTickets = document.querySelector("[data-order-tickets]");
  var orderDue = document.querySelector("[data-order-due]");
  var orderState = null;

  var state = {
    events: [],
    team: [],
    editingEvent: null,
    editingMember: null,
    dirty: false,
    tab: "events"
  };

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

  function log(message) {
    if (logEl) logEl.textContent = message;
  }

  function renderAll() {
    renderEvents();
    renderTeam();
  }

  function setDirty(value) {
    state.dirty = value;
    if (saveState) {
      saveState.textContent = value ? "Unsaved changes" : "Saved";
      saveState.dataset.dirty = value ? "true" : "false";
    }
  }

  /* ---------- API ---------- */
  function api(path, options) {
    var config = Object.assign({ method: "GET", headers: { "Content-Type": "application/json" } }, options || {});
    return fetch(path, config).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (err) { data = {}; }
        if (!res.ok) {
          var error = new Error(data.error || "Request failed (" + res.status + ")");
          error.status = res.status;
          throw error;
        }
        return data;
      });
    });
  }

  /* ---------- Session ---------- */
  function showLogin(message) {
    if (setup) setup.hidden = true;
    if (login) login.hidden = false;
    if (editor) editor.hidden = true;
    if (message) {
      loginStatus.textContent = message;
      loginStatus.dataset.state = "error";
    }
    var field = document.getElementById("password");
    if (field) field.focus();
  }

  function showEditor() {
    if (login) login.hidden = true;
    if (setup) setup.hidden = true;
    if (editor) editor.hidden = false;
  }

  function showSetup() {
    if (login) login.hidden = true;
    if (editor) editor.hidden = true;
    if (setup) setup.hidden = false;
    var field = document.getElementById("s-username");
    if (field) field.focus();
  }

  function checkSession() {
    api("/api/session")
      .then(function (data) {
        if (data.authenticated) { showEditor(); load(); return; }
        if (data.configured === false) { showSetup(); return; }
        showLogin("");
      })
      .catch(function (err) {
        showLogin(err.status === 500
          ? "The server is missing its environment variables (see README)."
          : "The editor API is not reachable. Admin editing works on the deployed site or with `npm run dev`.");
      });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var username = loginForm.querySelector("#username").value.trim();
      var password = loginForm.querySelector("#password").value;
      var button = loginForm.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = "Signing in…";
      loginStatus.textContent = "";
      api("/api/login", { method: "POST", body: JSON.stringify({ username: username, password: password }) })
        .then(function () {
          loginForm.reset();
          showEditor();
          load();
        })
        .catch(function (err) {
          loginStatus.textContent = err.message || "Sign in failed.";
          loginStatus.dataset.state = "error";
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = "Sign in";
        });
    });
  }

  if (setupForm) {
    setupForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var username = setupForm.querySelector("#s-username").value.trim();
      var password = setupForm.querySelector("#s-password").value;
      var repeat = setupForm.querySelector("#s-password2").value;
      var button = setupForm.querySelector('[type="submit"]');

      if (password !== repeat) {
        setupStatus.textContent = "The two passwords do not match.";
        setupStatus.dataset.state = "error";
        return;
      }

      button.disabled = true;
      button.textContent = "Creating…";
      setupStatus.textContent = "";

      api("/api/setup", { method: "POST", body: JSON.stringify({ username: username, password: password }) })
        .then(function () {
          setupForm.reset();
          showEditor();
          load();
        })
        .catch(function (err) {
          if (err.status === 409) {
            showLogin("An owner account already exists — sign in instead.");
            return;
          }
          setupStatus.textContent = err.message || "That did not work.";
          setupStatus.dataset.state = "error";
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = "Create owner account";
        });
    });
  }

  function logout() {
    api("/api/logout", { method: "POST" })
      .catch(function () {})
      .finally(function () {
        setDirty(false);
        state.events = [];
        state.team = [];
        orderState = null;
        if (orderList) orderList.innerHTML = "";
        showLogin("Signed out.");
      });
  }

  /* ---------- Load / save ---------- */
  function load() {
    api("/api/content")
      .then(function (data) {
        state.events = Array.isArray(data.events) ? data.events : [];
        state.team = Array.isArray(data.team) ? data.team : [];
        renderAll();
        setDirty(false);
        log("Loaded " + state.events.length + " events and " + state.team.length + " people.");
        loadOrders();
      })
      .catch(function (err) {
        log(err.message);
      });
  }

  function save() {
    if (!state.dirty) { log("Nothing to save."); return; }
    api("/api/content", {
      method: "PUT",
      body: JSON.stringify({ events: state.events, team: state.team })
    })
      .then(function (data) {
        setDirty(false);
        log(data.commit
          ? "Published as commit " + String(data.commit).slice(0, 7) + ". The site rebuilds automatically."
          : "Saved to assets/data/content.json.");
        load();
      })
      .catch(function (err) {
        if (err.status === 401) showLogin("Session expired — sign in again.");
        else log(err.message);
      });
  }

  /* ---------- Events ---------- */
  function sortedEvents() {
    return state.events.slice().sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); });
  }

  function renderEvents() {
    if (!eventList) return;
    var events = sortedEvents();
    eventList.innerHTML = events.map(function (ev) {
      var d = new Date(ev.date);
      var valid = !isNaN(d.getTime());
      return '' +
        '<div class="admin-row">' +
          '<div><b>' + (valid ? pad(d.getDate()) : "--") + '</b><small>' + (valid ? MONTHS[d.getMonth()] : "—") + '</small></div>' +
          '<div>' +
            '<div class="admin-row-title">' + esc(ev.title || "Untitled") + (ev.featured ? ' · on home page' : '') + '</div>' +
            '<div class="admin-row-meta">' + esc(ev.displayDate || ev.date || "") +
              (ev.timezone ? " · " + esc(ev.timezone) : "") + ' · ' + esc(ev.venue || "—") + '</div>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="btn btn--ghost btn--small" type="button" data-edit-event="' + esc(ev.id) + '">Edit</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-delete-event="' + esc(ev.id) + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join("");
    if (eventEmpty) eventEmpty.hidden = events.length !== 0;
    if (eventCount) eventCount.textContent = events.length + " total";
  }

  function clearEventForm() {
    state.editingEvent = null;
    eventForm.reset();
    if (eventFormTitle) eventFormTitle.textContent = "New event";
    if (eventSubmit) eventSubmit.textContent = "Add event";
  }

  function fillEventForm(ev) {
    state.editingEvent = ev.id;
    eventForm.querySelector('[name="title"]').value = ev.title || "";
    var when = new Date(ev.date);
    if (!isNaN(when.getTime())) {
      eventForm.querySelector('[name="date"]').value =
        pad(when.getDate()) + "/" + pad(when.getMonth() + 1) + "/" + String(when.getFullYear()).slice(-2);
      eventForm.querySelector('[name="start"]').value = pad(when.getHours()) + ":" + pad(when.getMinutes());
    } else {
      eventForm.querySelector('[name="date"]').value = "";
      eventForm.querySelector('[name="start"]').value = "";
    }
    eventForm.querySelector('[name="time"]').value = ev.time || "";
    eventForm.querySelector('[name="timezone"]').value = ev.timezone || "GMT";
    eventForm.querySelector('[name="venue"]').value = ev.venue || "";
    eventForm.querySelector('[name="entry"]').value = ev.entry || "";
    eventForm.querySelector('[name="ticket"]').value = Number(ev.ticket) || 0;
    eventForm.querySelector('[name="status"]').value = ev.status || "open";
    eventForm.querySelector('[name="statusLabel"]').value = ev.statusLabel || "";
    eventForm.querySelector('[name="description"]').value = ev.description || "";
    eventForm.querySelector('[name="featured"]').checked = !!ev.featured;
    eventForm.querySelectorAll('[name="tag"]').forEach(function (box) {
      box.checked = (ev.tags || []).indexOf(box.value) !== -1;
    });
    if (eventFormTitle) eventFormTitle.textContent = "Edit event";
    if (eventSubmit) eventSubmit.textContent = "Save event";
    eventForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function displayDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function makeId(text, fallback) {
    var base = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return base || fallback;
  }

  /* dd/mm/yy (or dd/mm/yyyy) → parts, or null when it is not a real date. */
  function parseUkDate(value) {
    var match = String(value || "").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
    if (!match) return null;
    var day = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    var probe = new Date(year, month - 1, day);
    if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
    return { day: day, month: month, year: year };
  }

  function parseClock(value) {
    var match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var hours = parseInt(match[1], 10);
    var minutes = parseInt(match[2], 10);
    if (hours > 23 || minutes > 59) return null;
    return { hours: hours, minutes: minutes };
  }

  if (eventForm) {
    eventForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = eventForm.querySelector('[name="title"]').value.trim();
      var day = parseUkDate(eventForm.querySelector('[name="date"]').value);
      var clock = parseClock(eventForm.querySelector('[name="start"]').value);
      if (!title) { log("A title is required."); return; }
      if (!day) { log("Give the date as dd/mm/yy, for example 31/12/26."); return; }
      if (!clock) { log("Give the start time as 24-hour, for example 21:00."); return; }

      var tags = [];
      eventForm.querySelectorAll('[name="tag"]:checked').forEach(function (box) { tags.push(box.value); });
      if (!tags.length) tags.push("club");

      var normalized = day.year + "-" + pad(day.month) + "-" + pad(day.day) +
        "T" + pad(clock.hours) + ":" + pad(clock.minutes) + ":00";
      var id = state.editingEvent || makeId(title + "-" + normalized.slice(0, 10), "event");
      var existing = state.events.find(function (ev) { return ev.id === id; });
      var pinned = eventForm.querySelector('[name="featured"]').checked;

      var event = {
        id: id,
        title: title,
        date: normalized,
        displayDate: displayDate(normalized),
        time: eventForm.querySelector('[name="time"]').value.trim(),
        venue: eventForm.querySelector('[name="venue"]').value.trim(),
        tags: tags,
        status: eventForm.querySelector('[name="status"]').value,
        statusLabel: eventForm.querySelector('[name="statusLabel"]').value.trim() || "Open",
        entry: eventForm.querySelector('[name="entry"]').value.trim(),
        ticket: Math.max(parseInt(eventForm.querySelector('[name="ticket"]').value, 10) || 0, 0),
        description: eventForm.querySelector('[name="description"]').value.trim(),
        timezone: eventForm.querySelector('[name="timezone"]').value,
        featured: pinned
      };

      if (pinned) {
        state.events = state.events.map(function (ev) {
          return ev.id === id ? ev : Object.assign({}, ev, { featured: false });
        });
      }

      if (existing) {
        state.events = state.events.map(function (ev) { return ev.id === id ? event : ev; });
        log("Updated “" + title + "”. Press Save changes to publish.");
      } else {
        state.events.push(event);
        log("Added “" + title + "”. Press Save changes to publish.");
      }
      clearEventForm();
      renderEvents();
      setDirty(true);
    });

    var pinnedBox = eventForm.querySelector('[name="featured"]');
    if (pinnedBox) {
      pinnedBox.addEventListener("change", function () {
        if (!pinnedBox.checked) return;
        state.events.forEach(function (ev) {
          if (ev.id !== state.editingEvent) ev.featured = false;
        });
        renderEvents();
        setDirty(true);
        log("Only one night can sit on the home page — saving unpins the others.");
      });
    }
  }

  if (eventList) {
    eventList.addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit-event]");
      var del = e.target.closest("[data-delete-event]");
      if (edit) {
        var found = state.events.find(function (ev) { return ev.id === edit.getAttribute("data-edit-event"); });
        if (found) fillEventForm(found);
      }
      if (del) {
        var id = del.getAttribute("data-delete-event");
        var ev = state.events.find(function (x) { return x.id === id; });
        if (!ev || !window.confirm("Delete “" + ev.title + "”?")) return;
        state.events = state.events.filter(function (x) { return x.id !== id; });
        if (state.editingEvent === id) clearEventForm();
        renderEvents();
        setDirty(true);
        log("Deleted “" + ev.title + "”. Press Save changes to publish.");
      }
    });
  }

  /* ---------- Team ---------- */
  function renderTeam() {
    if (!teamList) return;
    teamList.innerHTML = state.team.map(function (member, index) {
      var thumb = member.photo
        ? '<div class="admin-thumb"><img src="' + esc(member.photo) + '" alt=""></div>'
        : '<div class="admin-thumb">' + esc(initials(member.name)) + '</div>';
      return '' +
        '<div class="admin-row admin-row--team">' +
          thumb +
          '<div>' +
            '<div class="admin-row-title">' + esc(member.name) + (member.featured ? ' · home' : '') + '</div>' +
            '<div class="admin-row-meta">' + esc(member.role || "—") + ' · ' + esc(member.dept || "Crew") +
              ((member.tags || []).length ? " · " + esc(member.tags.join(", ")) : "") + '</div>' +
          '</div>' +
          '<div class="admin-row-tools">' +
            '<button class="admin-icon" type="button" data-move="up" data-id="' + esc(member.id) + '" aria-label="Move up"' + (index === 0 ? " disabled" : "") + '>↑</button>' +
            '<button class="admin-icon" type="button" data-move="down" data-id="' + esc(member.id) + '" aria-label="Move down"' + (index === state.team.length - 1 ? " disabled" : "") + '>↓</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-edit-member="' + esc(member.id) + '">Edit</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-delete-member="' + esc(member.id) + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join("");
    if (teamEmpty) teamEmpty.hidden = state.team.length !== 0;
    if (teamCount) teamCount.textContent = state.team.length + " on the roster";

    var datalist = document.getElementById("dept-options");
    if (datalist) {
      var depts = [];
      state.team.forEach(function (m) { if (m.dept && depts.indexOf(m.dept) === -1) depts.push(m.dept); });
      datalist.innerHTML = depts.map(function (d) { return '<option value="' + esc(d) + '"></option>'; }).join("");
    }
  }

  function clearMemberForm() {
    state.editingMember = null;
    memberForm.reset();
    if (memberFormTitle) memberFormTitle.textContent = "Add someone";
    if (memberSubmit) memberSubmit.textContent = "Add person";
  }

  function fillMemberForm(member) {
    state.editingMember = member.id;
    memberForm.querySelector('[name="name"]').value = member.name || "";
    memberForm.querySelector('[name="role"]').value = member.role || "";
    memberForm.querySelector('[name="dept"]').value = member.dept || "";
    memberForm.querySelector('[name="photo"]').value = member.photo || "";
    memberForm.querySelector('[name="bio"]').value = member.bio || "";
    memberForm.querySelector('[name="tags"]').value = (member.tags || []).join(", ");
    memberForm.querySelector('[name="featured"]').checked = !!member.featured;
    if (memberFormTitle) memberFormTitle.textContent = "Edit person";
    if (memberSubmit) memberSubmit.textContent = "Save person";
    memberForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (memberForm) {
    memberForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = memberForm.querySelector('[name="name"]').value.trim();
      if (!name) { log("A name is required."); return; }

      var photo = memberForm.querySelector('[name="photo"]').value.trim();
      if (photo && !/^https:\/\/[^\s]+$/i.test(photo)) {
        log("Photos need to be a full https:// link (or left empty to use initials).");
        return;
      }

      var tags = memberForm.querySelector('[name="tags"]').value.split(",")
        .map(function (t) { return t.trim(); })
        .filter(Boolean)
        .slice(0, 6);

      var id = state.editingMember || makeId(name, "member");
      var existing = state.team.find(function (m) { return m.id === id; });
      var member = {
        id: id,
        name: name,
        role: memberForm.querySelector('[name="role"]').value.trim(),
        dept: memberForm.querySelector('[name="dept"]').value.trim() || "Crew",
        bio: memberForm.querySelector('[name="bio"]').value.trim(),
        tags: tags,
        photo: photo,
        featured: memberForm.querySelector('[name="featured"]').checked
      };

      if (existing) {
        state.team = state.team.map(function (m) { return m.id === id ? member : m; });
        log("Updated “" + name + "”. Press Save changes to publish.");
      } else {
        state.team.push(member);
        log("Added “" + name + "”. Press Save changes to publish.");
      }
      clearMemberForm();
      renderTeam();
      setDirty(true);
    });
  }

  if (teamList) {
    teamList.addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit-member]");
      var del = e.target.closest("[data-delete-member]");
      var move = e.target.closest("[data-move]");

      if (edit) {
        var found = state.team.find(function (m) { return m.id === edit.getAttribute("data-edit-member"); });
        if (found) fillMemberForm(found);
      }

      if (del) {
        var id = del.getAttribute("data-delete-member");
        var member = state.team.find(function (x) { return x.id === id; });
        if (!member || !window.confirm("Remove " + member.name + " from the roster?")) return;
        state.team = state.team.filter(function (x) { return x.id !== id; });
        if (state.editingMember === id) clearMemberForm();
        renderTeam();
        setDirty(true);
        log("Removed “" + member.name + "”. Press Save changes to publish.");
      }

      if (move) {
        var moveId = move.getAttribute("data-id");
        var from = state.team.findIndex(function (x) { return x.id === moveId; });
        var to = move.getAttribute("data-move") === "up" ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= state.team.length) return;
        var moved = state.team.splice(from, 1)[0];
        state.team.splice(to, 0, moved);
        renderTeam();
        setDirty(true);
      }
    });
  }

  /* ---------- Orders ---------- */
  function cash(value) {
    return "$" + Number(value || 0).toLocaleString("en-GB");
  }

  function renderOrders() {
    if (!orderList || !orderState) return;
    var items = orderState.items || [];

    orderList.innerHTML = items.map(function (item) {
      var created = item.created ? new Date(item.created) : null;
      var when = created && !isNaN(created.getTime())
        ? created.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "";
      var meta = [item.night, "ref " + item.id, when, item.notes].filter(Boolean).map(esc).join(" · ");

      return '' +
        '<div class="admin-row">' +
          '<div><b>' + esc(item.qty) + '</b><small>tix</small></div>' +
          '<div>' +
            '<div class="admin-row-title">' + esc(item.icName) + ' · ' + esc(item.roblox) + ' · ' + cash(item.total) +
              (item.status === "paid" ? ' · paid' : '') + '</div>' +
            '<div class="admin-row-meta">' + meta + '</div>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="btn btn--ghost btn--small" type="button" data-order-paid="' + esc(item.id) + '">' +
              (item.status === "paid" ? "Mark unpaid" : "Mark paid") + '</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-order-delete="' + esc(item.id) + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join("");

    if (orderEmpty) orderEmpty.hidden = items.length !== 0;

    var tickets = items.reduce(function (sum, i) { return sum + Number(i.qty || 0); }, 0);
    var due = items.filter(function (i) { return i.status !== "paid"; })
      .reduce(function (sum, i) { return sum + Number(i.total || 0); }, 0);

    if (orderCount) orderCount.textContent = items.length + " orders · " + tickets + " tickets";
    if (orderTickets) orderTickets.textContent = String(tickets);
    if (orderDue) orderDue.textContent = cash(due);
  }

  function saveOrders(message) {
    if (!orderState) return;
    api("/api/orders", {
      method: "PUT",
      body: JSON.stringify({ items: orderState.items })
    })
      .then(function (data) {
        log((message ? message + " " : "") + "Saved " + data.items + " orders.");
      })
      .catch(function (err) {
        if (err.status === 401) showLogin("Session expired — sign in again.");
        else log(err.message);
      });
  }

  function loadOrders() {
    if (!orderList) return;
    api("/api/orders")
      .then(function (data) {
        orderState = { items: Array.isArray(data.items) ? data.items : [] };
        renderOrders();
      })
      .catch(function (err) {
        if (err.status === 401) return;
        log(err.message);
      });
  }

  if (orderList) {
    orderList.addEventListener("click", function (e) {
      if (!orderState) return;
      var paid = e.target.closest("[data-order-paid]");
      var del = e.target.closest("[data-order-delete]");

      if (paid) {
        var id = paid.getAttribute("data-order-paid");
        orderState.items = orderState.items.map(function (item) {
          return item.id === id
            ? Object.assign({}, item, { status: item.status === "paid" ? "unpaid" : "paid" })
            : item;
        });
        renderOrders();
        saveOrders("Updated order.");
      }

      if (del) {
        var removeId = del.getAttribute("data-order-delete");
        var item = orderState.items.filter(function (x) { return x.id === removeId; })[0];
        if (!item || !window.confirm("Delete the order for " + item.icName + "?")) return;
        orderState.items = orderState.items.filter(function (x) { return x.id !== removeId; });
        renderOrders();
        saveOrders("Deleted order.");
      }
    });
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.tab = button.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach(function (b) {
        b.setAttribute("aria-selected", String(b === button));
      });
      document.querySelectorAll("[data-tab-panel]").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-tab-panel") !== state.tab;
      });
    });
  });

  /* ---------- Toolbar ---------- */
  document.querySelectorAll("[data-action]").forEach(function (button) {
    button.addEventListener("click", function () {
      var action = button.getAttribute("data-action");
      if (action === "save") save();
      if (action === "logout") logout();
      if (action === "clear-event") clearEventForm();
      if (action === "clear-member") clearMemberForm();
      if (action === "reload") {
        if (state.dirty && !window.confirm("Discard unsaved changes?")) return;
        load();
      }
    });
  });

  window.addEventListener("beforeunload", function (e) {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ---------- Boot ---------- */
  checkSession();
})();
